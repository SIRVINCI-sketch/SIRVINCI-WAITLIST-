declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

import "./recovery-core.js";

const allowedOrigins = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:3030",
  "http://127.0.0.1:3030",
  "http://localhost:5500",
  "https://sirvinciacademy.com",
  "https://www.sirvinciacademy.com",
  "https://sirvinciacademy-waitlist.vercel.app",
  "https://sirvinci-waitlist.vercel.app",
]);

interface EmailRequest {
  full_name?: string;
  email: string;
  whatsapp_url?: string;
  action?: string;
  batch_size?: number;
  job_ids?: string[];
  include_blocked?: boolean;
}

interface EmailJob {
  job_id: string;
  status: string;
  email: string;
  full_name: string;
  attempt_count: number;
  idempotency_key: string;
  created_at: string;
  next_attempt_at?: string | null;
}

interface JobResult {
  status: string;
  error_category?: string | null;
  provider_status?: number;
}

interface RecoveryCore {
  classifyProviderStatus(status: number): string;
  retryDelaySeconds(attemptCount: number): number;
  constantTimeEquals(left: string, right: string): boolean;
  isSenderConfigurationValid(apiKey: string, fromEmail: string): boolean;
  isSenderDomainVerified(apiKey: string, fromEmail: string, fetchImpl: typeof fetch): Promise<boolean>;
  getCorsHeaders(origin: string | null | undefined, allowedOrigins: Set<string>): Record<string, string>;
  isWithinIdempotencyWindow(createdAt: string): boolean;
  sendClaimedJob(job: EmailJob, options: Record<string, unknown>): Promise<JobResult>;
}

declare const WAITLIST_EMAIL_CORE: RecoveryCore;

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://pnkxoktjhzjvjarediid.supabase.co";

async function callServiceRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) throw new Error("Email queue database configuration is missing.");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`Email queue operation failed (${response.status}).`);
  return await response.json() as T;
}

async function finishJob(jobId: string, result: Record<string, unknown>): Promise<string> {
  return await callServiceRpc<string>("complete_waitlist_email_job", {
    p_job_id: jobId,
    p_outcome: result.outcome,
    p_provider_message_id: result.providerMessageId ?? null,
    p_error_category: result.errorCategory ?? null,
    p_error_message: result.errorMessage ?? null,
    p_retry_after_seconds: result.retryAfterSeconds ?? null,
  });
}

async function processJobs(jobs: EmailJob[]) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() || "";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "";
  const results: Array<{ job_id: string; status: string; error_category?: string | null }> = [];

  for (const job of jobs) {
    try {
      const result = await WAITLIST_EMAIL_CORE.sendClaimedJob(job, {
        apiKey,
        fromEmail,
        fetchImpl: fetch,
        finishJob,
      });
      results.push({ job_id: job.job_id, ...result });
    } catch (error) {
      console.error("[Email Recovery] Job processing failed:", job.job_id, error instanceof Error ? error.message : "unknown error");
      const status = await finishJob(job.job_id, {
        outcome: WAITLIST_EMAIL_CORE.isWithinIdempotencyWindow(job.created_at) ? "retryable" : "uncertain",
        errorCategory: "worker_error",
        errorMessage: "Email recovery worker could not finish processing this job.",
        retryAfterSeconds: WAITLIST_EMAIL_CORE.retryDelaySeconds(job.attempt_count),
      });
      results.push({ job_id: job.job_id, status, error_category: status === "uncertain" ? "delivery_uncertain" : "temporary_provider_error" });
    }
  }
  return results;
}

async function queueEmail(email: string, fullName: string | undefined) {
  const jobs = await callServiceRpc<EmailJob[]>("enqueue_waitlist_email", { p_email: email });
  const job = jobs[0];
  if (!job) throw new Error("No durable email job could be created.");
  if (job.status === "accepted") return { ok: true, status: "accepted", job_id: job.job_id };
  if (job.status === "processing") return { ok: true, status: "pending", job_id: job.job_id };
  if (job.status === "blocked") return { ok: true, status: "blocked", error_category: "configuration_blocked", job_id: job.job_id };
  if (job.status === "uncertain") return { ok: true, status: "uncertain", error_category: "delivery_uncertain", job_id: job.job_id };
  if (job.status === "failed") return { ok: false, status: "failed", error_category: "provider_rejected", job_id: job.job_id };

  const claimed = await callServiceRpc<EmailJob[]>("claim_waitlist_email_jobs", {
    p_job_ids: [job.job_id],
    p_include_blocked: false,
    p_batch_size: 1,
  });
  if (!claimed.length) {
    const waitingStatus = job.status === "retryable" ? "retryable" : "pending";
    return { ok: true, status: waitingStatus, job_id: job.job_id };
  }
  const [result] = await processJobs(claimed);
  return { ok: true, ...result, job_id: job.job_id };
}

async function isConfiguredSenderDomainVerified(apiKey: string, fromEmail: string): Promise<boolean> {
  return await WAITLIST_EMAIL_CORE.isSenderDomainVerified(apiKey, fromEmail, fetch);
}

function getCorsHeaders(origin?: string | null) {
  return WAITLIST_EMAIL_CORE.getCorsHeaders(origin, allowedOrigins);
}

function buildSafeErrorResponse(status: number, error: string, origin?: string | null, providerStatus?: number) {
  const headers = getCorsHeaders(origin);

  return new Response(
    JSON.stringify({
      ok: false,
      status: "error",
      error,
      provider_status: providerStatus ?? null,
    }),
    {
      status,
      headers,
    }
  );
}

function buildSuccessResponse(body: Record<string, unknown>, origin?: string | null) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: getCorsHeaders(origin),
    });
  }

  if (req.method !== "POST") {
    return buildSafeErrorResponse(405, "Method not allowed", origin);
  }

  try {
    const body = (await req.json()) as Partial<EmailRequest>;
    const { full_name, email, whatsapp_url } = body;

    const recoverySecret = Deno.env.get("EMAIL_RECOVERY_SECRET")?.trim() || "";
    const suppliedRecoverySecret = req.headers.get("x-email-recovery-secret") || "";
    const isRecoveryRequest = recoverySecret.length > 0 && WAITLIST_EMAIL_CORE.constantTimeEquals(suppliedRecoverySecret, recoverySecret);
    if (body.action) {
      if (!isRecoveryRequest) return buildSafeErrorResponse(401, "Unauthorized", origin);
      if (body.action !== "process_due" && body.action !== "recover_blocked") {
        return buildSafeErrorResponse(400, "Unsupported recovery action", origin);
      }
      const hasVerifiedSender = await isConfiguredSenderDomainVerified(
        Deno.env.get("RESEND_API_KEY")?.trim() || "",
        Deno.env.get("RESEND_FROM_EMAIL")?.trim() || ""
      );
      if (body.action === "recover_blocked" && body.include_blocked === true && !hasVerifiedSender) {
        return buildSafeErrorResponse(409, "The configured sender domain is not verified yet.", origin);
      }
      const includeBlocked = body.action === "recover_blocked" && body.include_blocked === true
        ? true
        : body.action === "process_due" && hasVerifiedSender;
      const jobs = await callServiceRpc<EmailJob[]>("claim_waitlist_email_jobs", {
        p_job_ids: Array.isArray(body.job_ids) ? body.job_ids : null,
        p_include_blocked: includeBlocked,
        p_batch_size: Math.min(Math.max(Number(body.batch_size) || 10, 1), 25),
      });
      const results = await processJobs(jobs);
      return buildSuccessResponse({
        ok: true,
        status: "processed",
        sender_domain_verified: hasVerifiedSender,
        count: results.length,
        results,
      }, origin);
    }

    if (!email || typeof email !== "string") {
      return buildSafeErrorResponse(400, "Email is required", origin);
    }

    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return buildSafeErrorResponse(400, "Email format is invalid", origin);
    }

    const queued = await queueEmail(trimmedEmail, full_name);
    return buildSuccessResponse(queued, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[Email Automation Error]:", message);
    return buildSafeErrorResponse(500, "Confirmation email request failed.", origin);
  }
});
