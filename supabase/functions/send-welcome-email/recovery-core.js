(function initializeWaitlistEmailCore(root) {
  const retryDelaysSeconds = [30, 120, 600, 3600, 21600];

  function classifyProviderStatus(status) {
    if (status >= 200 && status < 300) return 'accepted';
    if (status === 401 || status === 403) return 'blocked';
    if (status === 429 || status >= 500) return 'retryable';
    return 'failed';
  }

  function retryDelaySeconds(attemptCount) {
    const index = Math.max(0, Math.min(Number(attemptCount) - 1, retryDelaysSeconds.length - 1));
    return retryDelaysSeconds[index];
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function constantTimeEquals(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) {
      mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return mismatch === 0;
  }

  function getCorsHeaders(origin, allowedOrigins) {
    const headers = {
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json'
    };
    if (typeof origin === 'string' && allowedOrigins.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
  }

  function isSenderConfigurationValid(apiKey, fromEmail) {
    return typeof apiKey === 'string' && apiKey.trim().length > 0 &&
      typeof fromEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail.trim());
  }

  async function isSenderDomainVerified(apiKey, fromEmail, fetchImpl) {
    if (!isSenderConfigurationValid(apiKey, fromEmail)) return false;
    const senderDomain = fromEmail.trim().split('@').pop().toLowerCase();
    try {
      const response = await fetchImpl('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!response.ok) return false;
      const data = await response.json();
      return (Array.isArray(data.data) ? data.data : []).some((domain) =>
        typeof domain.name === 'string' && domain.name.toLowerCase() === senderDomain &&
        typeof domain.status === 'string' && domain.status.toLowerCase() === 'verified'
      );
    } catch {
      return false;
    }
  }

  function isWithinIdempotencyWindow(createdAt, now = Date.now()) {
    const createdTime = Date.parse(createdAt);
    return Number.isFinite(createdTime) && now - createdTime < 23 * 60 * 60 * 1000;
  }

  function evaluateResendThrottle({ lastRequestedAt, windowStartedAt, requestCount }, now = Date.now()) {
    const lastRequest = Date.parse(lastRequestedAt || '');
    const windowStart = Date.parse(windowStartedAt || '');
    const count = Number(requestCount) || 0;
    if (Number.isFinite(lastRequest) && now - lastRequest < 15 * 60 * 1000) {
      return { allowed: false, reason: 'cooldown' };
    }
    if (Number.isFinite(windowStart) && now - windowStart < 24 * 60 * 60 * 1000 && count >= 3) {
      return { allowed: false, reason: 'daily_limit' };
    }
    return { allowed: true, nextCount: Number.isFinite(windowStart) && now - windowStart < 24 * 60 * 60 * 1000 ? count + 1 : 1 };
  }

  async function sendClaimedJob(job, options) {
    const {
      apiKey,
      fromEmail,
      fetchImpl,
      finishJob,
      now = Date.now()
    } = options;

    if (!isSenderConfigurationValid(apiKey, fromEmail)) {
      const savedStatus = await finishJob(job.job_id, {
        outcome: 'blocked',
        errorCategory: 'configuration_blocked',
        errorMessage: 'Resend API key or sender address is not configured.'
      });
      return { status: savedStatus, error_category: 'configuration_blocked' };
    }

    const firstName = escapeHtml(String(job.full_name || 'Creator').trim().split(/\s+/)[0] || 'Creator');
    const communityUrl = 'https://chat.whatsapp.com/DwUFjABTAPCA9BNmIS5SXc';
    const subject = "You're on the list! Welcome to Sirvinci Academy";
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111"><main style="max-width:540px;margin:auto;padding:32px"><h1>You're on the waitlist, ${firstName}!</h1><p>Your registration for Sirvinci Academy is saved. We will send launch updates and founding-member information to this address.</p><p><a href="${communityUrl}">Join the Sirvinci creator community</a></p><p>— Sirvinci Academy</p></main></body></html>`;
    const idempotencyKey = `sirvinci-waitlist-${job.idempotency_key}`;

    let providerResponse;
    try {
      providerResponse = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({ from: fromEmail, to: [job.email], subject, html })
      });
    } catch {
      const outcome = isWithinIdempotencyWindow(job.created_at, now) ? 'retryable' : 'uncertain';
      const savedStatus = await finishJob(job.job_id, {
        outcome,
        errorCategory: 'provider_response_unknown',
        errorMessage: outcome === 'retryable'
          ? 'Provider response was not received; retry uses the same idempotency key.'
          : 'Provider response is unknown outside the safe idempotency window.'
      });
      return { status: savedStatus, error_category: outcome === 'uncertain' ? 'delivery_uncertain' : 'temporary_provider_error' };
    }

    const status = classifyProviderStatus(providerResponse.status);
    let providerData = {};
    try {
      providerData = await providerResponse.json();
    } catch {
      providerData = {};
    }

    const providerMessageId = providerData && typeof providerData.id === 'string' ? providerData.id : null;
    const outcome = status === 'retryable' && Number(job.attempt_count) >= 6 ? 'failed' : status;
    const savedStatus = await finishJob(job.job_id, {
      outcome,
      providerMessageId,
      errorCategory: outcome === 'blocked' ? 'configuration_blocked'
        : outcome === 'retryable' ? 'temporary_provider_error'
          : outcome === 'failed' ? 'provider_rejected' : null,
      errorMessage: outcome === 'accepted' ? null
        : outcome === 'blocked' ? 'Sender configuration or provider authorization is blocked.'
          : outcome === 'retryable' ? 'Email provider returned a temporary failure.'
            : 'Email provider rejected the message.',
      retryAfterSeconds: outcome === 'retryable' ? retryDelaySeconds(job.attempt_count) : null
    });

    return {
      status: savedStatus,
      error_category: savedStatus === 'blocked' ? 'configuration_blocked'
        : savedStatus === 'retryable' ? 'temporary_provider_error'
          : savedStatus === 'uncertain' ? 'delivery_uncertain'
            : savedStatus === 'failed' ? 'provider_rejected' : null,
      provider_status: providerResponse.status
    };
  }

  const api = {
    classifyProviderStatus,
    retryDelaySeconds,
    escapeHtml,
    constantTimeEquals,
    getCorsHeaders,
    isSenderConfigurationValid,
    isSenderDomainVerified,
    isWithinIdempotencyWindow,
    evaluateResendThrottle,
    sendClaimedJob
  };

  root.WAITLIST_EMAIL_CORE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
