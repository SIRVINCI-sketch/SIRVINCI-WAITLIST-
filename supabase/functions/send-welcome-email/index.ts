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
  "https://waitlist.sirvincistudio.com",
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
  country_of_residence?: string;
  expected_cost_amount?: number | string | null;
  expected_cost_currency?: string | null;
  pricing_unsure?: boolean;
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
  extractSenderEmail(from: string): string;
  isSenderConfigurationValid(apiKey: string, fromEmail: string): boolean;
  isSenderDomainVerified(apiKey: string, fromEmail: string, fetchImpl: typeof fetch): Promise<boolean>;
  getCorsHeaders(origin: string | null | undefined, allowedOrigins: Set<string>): Record<string, string>;
  isWithinIdempotencyWindow(createdAt: string): boolean;
  normalizeTrustedClientIp(value: string | null): string | null;
  hashIpForRateLimit(ip: string, secret: string): Promise<string>;
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

function buildRateLimitResponse(origin: string | null | undefined, reason: string) {
  const headers = getCorsHeaders(origin);
  const retryAfterSeconds = reason === "daily_limit" ? 86400
    : reason === "hour_limit" ? 3600
      : 60;
  headers["Retry-After"] = String(retryAfterSeconds);
  headers["Cache-Control"] = "no-store";
  return new Response(JSON.stringify({
    ok: false,
    status: "rate_limited",
    error: "Too many requests from this network. Please wait before trying again.",
  }), { status: 429, headers });
}

async function enforcePublicIpRateLimit(req: Request, origin?: string | null): Promise<Response | null> {
  // Use the gateway-populated CF-Connecting-IP header; never trust arbitrary
  // X-Forwarded-For text supplied by a browser.
  const clientIp = WAITLIST_EMAIL_CORE.normalizeTrustedClientIp(req.headers.get("cf-connecting-ip"));
  if (!clientIp) {
    console.warn("[Waitlist Rate Limit] Trusted client IP unavailable; email limits remain active.");
    return null;
  }

  // Prefer a dedicated key. The current recovery secret is a domain-separated
  // fallback, so this protection works before a dedicated secret is configured.
  const rateLimitSecret = Deno.env.get("WAITLIST_RATE_LIMIT_HMAC_SECRET")?.trim()
    || Deno.env.get("EMAIL_RECOVERY_SECRET")?.trim()
    || "";
  if (!rateLimitSecret) {
    console.error("[Waitlist Rate Limit] HMAC secret unavailable; IP limits skipped.");
    return null;
  }

  try {
    const ipHash = await WAITLIST_EMAIL_CORE.hashIpForRateLimit(clientIp, rateLimitSecret);
    const result = await callServiceRpc<Array<{ allowed: boolean; reason: string }>>(
      "consume_waitlist_ip_rate_limit",
      { p_ip_hash: ipHash },
    );
    if (!Array.isArray(result) || result.length === 0 || typeof result[0].allowed !== "boolean") {
      throw new Error("IP rate-limit RPC returned an invalid result.");
    }
    if (result[0].allowed) return null;
    console.warn("[Waitlist Rate Limit] Public action rejected by IP quota:", result[0].reason || "rate_limited");
    return buildRateLimitResponse(origin, result[0].reason || "minute_limit");
  } catch (error) {
    // Keep registrations available if only this independent limiter fails;
    // the email limiter and duplicate-registration safeguards still apply.
    console.error("[Waitlist Rate Limit] IP check failed; allowing fallback:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

async function registerWaitlist(body: Partial<EmailRequest>, origin?: string | null) {
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!fullName || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return buildSafeErrorResponse(400, "Please provide a valid name and email address.", origin);
  }

  const hasStructuredPricing = Object.prototype.hasOwnProperty.call(body, "country_of_residence")
    || Object.prototype.hasOwnProperty.call(body, "expected_cost_amount")
    || Object.prototype.hasOwnProperty.call(body, "expected_cost_currency")
    || Object.prototype.hasOwnProperty.call(body, "pricing_unsure");
  if (hasStructuredPricing) {
    const country = typeof body.country_of_residence === "string" ? body.country_of_residence.trim() : "";
    const amount = typeof body.expected_cost_amount === "number" ? body.expected_cost_amount
      : typeof body.expected_cost_amount === "string" && body.expected_cost_amount.trim() ? Number(body.expected_cost_amount) : null;
    const currency = typeof body.expected_cost_currency === "string" ? body.expected_cost_currency.trim().toUpperCase() : "";
    const unsure = body.pricing_unsure === true;
    if (!country || country.length > 100) return buildSafeErrorResponse(400, "Please provide your country of residence.", origin);
    if (unsure) {
      if (amount !== null || currency) return buildSafeErrorResponse(400, "Choose either an amount or the unsure option, not both.", origin);
    } else if (amount === null || !Number.isFinite(amount) || amount <= 0 || amount > 999999999 || !/^[A-Z]{3}$/.test(currency)) {
      return buildSafeErrorResponse(400, "Please provide a valid amount and 3-letter currency code, or select the unsure option.", origin);
    }
  }

  await callServiceRpc<string>("register_waitlist", {
    p_full_name: fullName,
    p_email: email,
    p_canva_experience: body.canva_experience ?? null,
    p_main_goal: body.main_goal ?? null,
    p_stopped_reason: body.stopped_reason ?? null,
    p_payment_pref: body.payment_pref ?? null,
    p_expected_cost: body.expected_cost ?? null,
    p_country_of_residence: body.country_of_residence ?? null,
    p_expected_cost_amount: body.pricing_unsure === true ? null : body.expected_cost_amount ?? null,
    p_expected_cost_currency: body.pricing_unsure === true ? null : body.expected_cost_currency ?? null,
    p_pricing_unsure: body.pricing_unsure === true,
  });

  // Ensure older registrations have an explicit uncertain outbox record, but
  // do not synchronously dispatch. The batched worker avoids response-time
  // membership side channels and processes due jobs automatically.
  try {
    const queuedJobs = await callServiceRpc<EmailJob[]>("enqueue_waitlist_email", { p_email: email });
    let queuedJob = Array.isArray(queuedJobs) ? queuedJobs[0] : undefined;

    // If an older registration has no outbox history, enqueue_waitlist_email
    // marks it uncertain rather than assuming whether a historical email was
    // sent. A fresh form submission is an explicit request to try again, so
    // route it through the normal resend rate limits and idempotency safeguards.
    if (queuedJob?.status === "uncertain" || queuedJob?.status === "accepted") {
      // A repeated form submission is also an explicit request to retry
      // confirmation when the existing job was already accepted. The resend
      // RPC enforces per-address cooldowns and daily limits.
      const senderVerified = await isConfiguredSenderDomainVerified(
        Deno.env.get("RESEND_API_KEY")?.trim() || "",
        Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "",
      );
      const resendJobs = await callServiceRpc<Array<EmailJob & { outcome: string }>>(
        "request_waitlist_email_resend",
        {
          p_email: email,
          p_sender_verified: senderVerified,
          p_request_id: crypto.randomUUID(),
        },
      );
      queuedJob = Array.isArray(resendJobs) ? resendJobs[0] : undefined;
    }

    // Dispatch immediately instead of making the student wait for cron.
    // The scheduled worker remains the safety net for retries and failures.
    if (queuedJob && ["pending", "retryable"].includes(queuedJob.status)) {
      const claimedJobs = await callServiceRpc<EmailJob[]>("claim_waitlist_email_jobs", {
        p_job_ids: [queuedJob.job_id],
        p_include_blocked: false,
        p_batch_size: 1,
      });
      if (claimedJobs.length > 0) {
        await processJobs(claimedJobs);
      }
    }
  } catch (error) {
    // The registration is already committed; dispatch failure must not turn
    // that into a false registration error. The scheduled worker will recover.
    console.error("[Email Recovery] Immediate registration dispatch deferred:", error instanceof Error ? error.message : "unknown error");
  }

  return buildSuccessResponse({ ok: true, status: "received" }, origin);
}

async function requestConfirmationResend(email: string, requestId: string, origin?: string | null) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() || "";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "";
  const senderVerified = await isConfiguredSenderDomainVerified(apiKey, fromEmail);
  const resendJobs = await callServiceRpc<Array<EmailJob & { outcome: string }>>(
    "request_waitlist_email_resend",
    {
      p_email: email,
      p_sender_verified: senderVerified,
      p_request_id: requestId,
    }
  );

  // Dispatch eligible resend jobs immediately. The cron worker remains the
  // recovery path if this request cannot claim/process the job.
  try {
    const queuedJob = Array.isArray(resendJobs) ? resendJobs[0] : undefined;
    if (queuedJob && ["pending", "retryable"].includes(queuedJob.status)) {
      const claimedJobs = await callServiceRpc<EmailJob[]>("claim_waitlist_email_jobs", {
        p_job_ids: [queuedJob.job_id],
        p_include_blocked: false,
        p_batch_size: 1,
      });
      if (claimedJobs.length > 0) {
        await processJobs(claimedJobs);
      }
    }
  } catch (error) {
    console.error(
      "[Email Recovery] Immediate resend dispatch deferred:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  // Deliberately disclose neither registration existence nor queue/provider
  // state. This is the same response for a new, duplicate, unknown, and
  // rate-limited address.
  return buildSuccessResponse({ ok: true, status: "request_received" }, origin);
}

async function isConfiguredSenderDomainVerified(apiKey: string, fromEmail: string): Promise<boolean> {
  const pureEmail = WAITLIST_EMAIL_CORE.extractSenderEmail ? WAITLIST_EMAIL_CORE.extractSenderEmail(fromEmail) : fromEmail;
  const domain = pureEmail.trim().split("@").pop()?.toLowerCase() || "";
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

    if (body.action === "register" || body.action === "request_resend") {
      const ipLimitResponse = await enforcePublicIpRateLimit(req, origin);
      if (ipLimitResponse) return ipLimitResponse;
    }

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
