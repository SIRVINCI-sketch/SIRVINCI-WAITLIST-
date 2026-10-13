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
  "https://waitlist.sirvinci.com",
  "https://sirvinciacademy.com",
  "https://www.sirvinciacademy.com",
  "https://sirvinciacademy-waitlist.vercel.app",
  "https://sirvinci-waitlist.vercel.app",
]);

interface EmailRequest {
  full_name?: string;
  email: string;
  canva_experience?: string;
  main_goal?: string;
  stopped_reason?: string;
  payment_pref?: string;
  expected_cost?: string;
  whatsapp_url?: string;
  action?: string;
  request_id?: string;
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
let senderVerificationCache: { domain: string; checkedAt: number; verified: boolean } | null = null;

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

async function registerWaitlist(body: Partial<EmailRequest>, origin?: string | null) {
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!fullName || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return buildSafeErrorResponse(400, "Please provide a valid name and email address.", origin);
  }

  await callServiceRpc<string>("register_waitlist", {
    p_full_name: fullName,
    p_email: email,
    p_canva_experience: body.canva_experience ?? null,
    p_main_goal: body.main_goal ?? null,
    p_stopped_reason: body.stopped_reason ?? null,
    p_payment_pref: body.payment_pref ?? null,
    p_expected_cost: body.expected_cost ?? null,
  });

  // Ensure older registrations have an explicit uncertain outbox record, but
  // do not synchronously dispatch. The batched worker avoids response-time
  // membership side channels and processes due jobs automatically.
  try {
    await callServiceRpc<EmailJob[]>("enqueue_waitlist_email", { p_email: email });
  } catch (error) {
    // The registration is already committed; dispatch failure must not turn
    // that into a false registration error. The scheduled worker will recover.
    console.error("[Email Recovery] Registration dispatch deferred:", error instanceof Error ? error.message : "unknown error");
  }

  return buildSuccessResponse({ ok: true, status: "received" }, origin);
}

async function requestConfirmationResend(email: string, requestId: string, origin?: string | null) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() || "";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "";
  const senderVerified = await isConfiguredSenderDomainVerified(apiKey, fromEmail);
  await callServiceRpc<Array<EmailJob & { outcome: string }>>(
    "request_waitlist_email_resend",
    {
      p_email: email,
      p_sender_verified: senderVerified,
      p_request_id: requestId,
    }
  );
  // Deliberately disclose neither registration existence nor queue/provider
  // state. This is the same response for a new, duplicate, unknown, and
  // rate-limited address.
  return buildSuccessResponse({ ok: true, status: "request_received" }, origin);
}

async function isConfiguredSenderDomainVerified(apiKey: string, fromEmail: string): Promise<boolean> {
  const domain = fromEmail.trim().split("@").pop()?.toLowerCase() || "";
  if (senderVerificationCache?.domain === domain && Date.now() - senderVerificationCache.checkedAt < 60_000) {
    return senderVerificationCache.verified;
  }
  const verified = await WAITLIST_EMAIL_CORE.isSenderDomainVerified(apiKey, fromEmail, fetch);
  senderVerificationCache = { domain, checkedAt: Date.now(), verified };
  return verified;
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

    if (body.action === "register") {
      return await registerWaitlist(body, origin);
    }
    if (body.action === "request_resend") {
      if (!email || typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return buildSafeErrorResponse(400, "Email format is invalid", origin);
      }
      if (typeof body.request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)) {
        return buildSafeErrorResponse(400, "A valid request identifier is required.", origin);
      }
      return await requestConfirmationResend(email.trim(), body.request_id, origin);
    }

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

    return buildSafeErrorResponse(400, "Unsupported request", origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[Email Automation Error]:", message);
    return buildSafeErrorResponse(500, "Confirmation email request failed.", origin);
  }
});
