const test = require('node:test');
const assert = require('node:assert/strict');
const EMAIL_CORE = require('../supabase/functions/send-welcome-email/recovery-core.js');

const {
  WAITLIST_UTILS,
  buildWaitlistPayload,
  isValidEmail,
  isEmailSendSuccess,
  parseJsonMaybe,
  getSafeErrorMessage,
  normalizeEmail,
  isDuplicateRegistrationError,
  getEmailLifecycleStatus
} = require('../main.js');

test('only full name and email are required for the waitlist form', () => {
  assert.deepEqual(WAITLIST_UTILS.validateRequiredFields({ fullName: '', email: '' }), {
    fullName: 'Please enter your full name.',
    email: 'Please enter a valid email address.'
  });

  assert.deepEqual(WAITLIST_UTILS.validateRequiredFields({ fullName: 'Jane Doe', email: 'jane@example.com' }), {});
  assert.deepEqual(WAITLIST_UTILS.validateRequiredFields({ fullName: 'Jane Doe', email: 'invalid' }), {
    email: 'Please enter a valid email address.'
  });

  assert.deepEqual(WAITLIST_UTILS.validateRequiredFields({ fullName: '  Jane Doe  ', email: '  JANE@example.com  ' }), {});
});

test('validates user email addresses and rejects malformed input', () => {
  assert.equal(isValidEmail('founder@sirvinci.com'), true);
  assert.equal(isValidEmail('  Founder@Sirvinci.com  '), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail(''), false);
});

test('builds the Supabase payload with required waitlist fields and without client-controlled status', () => {
  const formData = new FormData();
  formData.set('canva_experience', 'Intermediate');
  formData.set('main_goal', 'Brand system');
  formData.set('stopped_reason', 'No time');
  formData.set('payment_pref', 'One-time');
  formData.set('expected_cost', '$150');

  const payload = buildWaitlistPayload(formData, '  Jane Doe  ', '  JANE@example.com  ');

  assert.deepEqual(payload, {
    full_name: 'Jane Doe',
    email: 'jane@example.com',
    canva_experience: 'Intermediate',
    main_goal: 'Brand system',
    stopped_reason: 'No time',
    payment_pref: 'One-time',
    expected_cost: '$150'
  });
});

test('a name-and-email-only registration omits every optional research field', () => {
  const payload = buildWaitlistPayload(new FormData(), 'Jane Doe', 'JANE@example.com');
  assert.deepEqual(payload, { full_name: 'Jane Doe', email: 'jane@example.com' });
});

test('recognizes email success only when the provider explicitly reports success', () => {
  assert.equal(isEmailSendSuccess({ ok: true }, { ok: true }), true);
  assert.equal(isEmailSendSuccess({ ok: true }, { success: true }), true);
  assert.equal(isEmailSendSuccess({ ok: true }, { status: 'sent' }), true);
  assert.equal(isEmailSendSuccess({ ok: true }, { ok: true, status: 'accepted' }), true);
  assert.equal(isEmailSendSuccess({ ok: true }, { ok: true, status: 'pending' }), false);
  assert.equal(isEmailSendSuccess({ ok: true }, { ok: true, status: 'blocked' }), false);
  assert.equal(isEmailSendSuccess({ ok: true }, { ok: true, status: 'retryable' }), false);
  assert.equal(isEmailSendSuccess({ ok: true }, { status: 'queued' }), false);
  assert.equal(isEmailSendSuccess({ ok: false }, { ok: true }), false);
  assert.equal(isEmailSendSuccess({ ok: true }, null), false);
});

test('detects duplicate-registration failures without misclassifying unrelated errors', () => {
  assert.equal(isDuplicateRegistrationError({ status: 409 }, { message: 'duplicate key value violates unique constraint' }), true);
  assert.equal(isDuplicateRegistrationError({ status: 409 }, { error: 'already registered' }), true);
  assert.equal(isDuplicateRegistrationError({ status: 500 }, { message: 'internal server error' }), false);
  assert.equal(isDuplicateRegistrationError(null, { message: 'duplicate email' }), true);
  assert.equal(isDuplicateRegistrationError({ status: 400 }, { message: 'bad request' }), false);
});

test('normalizeEmail trims and lowercases addresses consistently', () => {
  assert.equal(normalizeEmail('  Jane@Example.com  '), 'jane@example.com');
  assert.equal(normalizeEmail('invalid'), 'invalid');
});

test('maps email lifecycle statuses to the correct user-visible outcomes', () => {
  assert.equal(getEmailLifecycleStatus({ ok: true }, { status: 'accepted' }), 'accepted');
  assert.equal(getEmailLifecycleStatus({ ok: true }, { status: 'queued' }), 'pending');
  assert.equal(getEmailLifecycleStatus({ ok: false }, { status: 'retryable' }), 'retryable');
  assert.equal(getEmailLifecycleStatus({ ok: false }, { status: 'blocked', error_category: 'configuration_blocked' }), 'blocked');
  assert.equal(getEmailLifecycleStatus({ ok: false }, { status: 'pending' }), 'pending');
  assert.equal(getEmailLifecycleStatus({ ok: false }, { status: 'error' }), 'error');
  assert.equal(getEmailLifecycleStatus({ ok: false }, { status: 'accepted' }), 'error');
  assert.match(WAITLIST_UTILS.getEmailOutcomeMessage('pending'), /registration is saved/i);
  assert.match(WAITLIST_UTILS.getEmailOutcomeMessage('accepted'), /accepted for delivery/i);
  assert.match(WAITLIST_UTILS.getEmailOutcomeMessage('retryable'), /retry.*automatically/i);
  assert.match(WAITLIST_UTILS.getEmailOutcomeMessage('blocked'), /queued for recovery/i);
  assert.match(WAITLIST_UTILS.getEmailOutcomeMessage('uncertain'), /could not be verified/i);
  assert.match(WAITLIST_UTILS.getEmailOutcomeMessage('error'), /could not be sent/i);
});

test('parseJsonMaybe returns only valid JSON and safe error messaging remains stable', () => {
  assert.deepEqual(parseJsonMaybe('{"ok":true}'), { ok: true });
  assert.equal(parseJsonMaybe('not-json'), null);
  assert.equal(getSafeErrorMessage(new Error('Resend rejected the request'), 'fallback'), 'Resend rejected the request');
  assert.equal(getSafeErrorMessage('custom message', 'fallback'), 'custom message');
  assert.equal(WAITLIST_UTILS.isEmailSendSuccess({ ok: true }, { status: 'sent' }), true);
});

test('recovery worker classifies Resend outcomes and uses bounded exponential backoff', () => {
  assert.equal(EMAIL_CORE.classifyProviderStatus(202), 'accepted');
  assert.equal(EMAIL_CORE.classifyProviderStatus(403), 'blocked');
  assert.equal(EMAIL_CORE.classifyProviderStatus(429), 'retryable');
  assert.equal(EMAIL_CORE.classifyProviderStatus(503), 'retryable');
  assert.equal(EMAIL_CORE.classifyProviderStatus(422), 'failed');
  assert.equal(EMAIL_CORE.isSenderConfigurationValid('', 'sender@example.com'), false);
  assert.equal(EMAIL_CORE.isSenderConfigurationValid('test-key', 'not-an-address'), false);
  assert.equal(EMAIL_CORE.isSenderConfigurationValid('test-key', 'sender@example.com'), true);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(EMAIL_CORE.retryDelaySeconds), [30, 120, 600, 3600, 21600, 21600, 21600]);
});

test('Resend testing-domain rejection is configuration-blocked without retry', async () => {
  let completion;
  const result = await EMAIL_CORE.sendClaimedJob({
    job_id: 'job-1', email: 'person@example.com', full_name: 'Jane Doe',
    attempt_count: 1, idempotency_key: 'stable-key', created_at: new Date().toISOString()
  }, {
    apiKey: 'test-key', fromEmail: 'onboarding@resend.dev',
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Testing domain cannot send to this recipient' }), { status: 403 }),
    finishJob: async (_id, value) => { completion = value; return value.outcome; }
  });

  assert.equal(result.status, 'blocked');
  assert.equal(completion.errorCategory, 'configuration_blocked');
  assert.equal(completion.retryAfterSeconds, null);
});

test('missing sender configuration blocks the durable job without contacting Resend', async () => {
  let completion;
  const result = await EMAIL_CORE.sendClaimedJob({
    job_id: 'job-missing-config', email: 'person@example.com', full_name: 'Jane Doe',
    attempt_count: 1, idempotency_key: 'stable-key', created_at: new Date().toISOString()
  }, {
    apiKey: '', fromEmail: '',
    fetchImpl: async () => { throw new Error('provider must not be called'); },
    finishJob: async (_id, value) => { completion = value; return value.outcome; }
  });

  assert.equal(result.status, 'blocked');
  assert.equal(completion.errorCategory, 'configuration_blocked');
});

test('temporary provider failure schedules retry and the later acceptance completes the same job', async () => {
  const job = {
    job_id: 'job-2', email: 'person@example.com', full_name: 'Jane Doe',
    attempt_count: 2, idempotency_key: 'stable-key', created_at: new Date().toISOString()
  };
  const completions = [];
  const common = {
    apiKey: 'test-key', fromEmail: 'verified@example.com',
    finishJob: async (_id, value) => { completions.push(value); return value.outcome; }
  };

  const retry = await EMAIL_CORE.sendClaimedJob(job, {
    ...common,
    fetchImpl: async () => new Response(JSON.stringify({ message: 'temporary outage' }), { status: 503 })
  });
  const accepted = await EMAIL_CORE.sendClaimedJob({ ...job, attempt_count: 3 }, {
    ...common,
    fetchImpl: async () => new Response(JSON.stringify({ id: 'resend-message-1' }), { status: 202 })
  });

  assert.equal(retry.status, 'retryable');
  assert.equal(completions[0].retryAfterSeconds, 120);
  assert.equal(accepted.status, 'accepted');
  assert.equal(completions[1].providerMessageId, 'resend-message-1');
});

test('ambiguous Resend response retries with a stable idempotency key only inside retention', async () => {
  const job = {
    job_id: 'job-3', email: 'person@example.com', full_name: 'Jane Doe',
    attempt_count: 1, idempotency_key: 'stable-key', created_at: new Date().toISOString()
  };
  let requestHeaders;
  let completion;
  const result = await EMAIL_CORE.sendClaimedJob(job, {
    apiKey: 'test-key', fromEmail: 'verified@example.com',
    fetchImpl: async (_url, options) => { requestHeaders = options.headers; throw new Error('connection reset after provider acceptance'); },
    finishJob: async (_id, value) => { completion = value; return value.outcome; }
  });

  assert.equal(result.status, 'retryable');
  assert.equal(completion.errorCategory, 'provider_response_unknown');
  assert.equal(requestHeaders['Idempotency-Key'], 'sirvinci-waitlist-stable-key');
  assert.equal(EMAIL_CORE.isWithinIdempotencyWindow(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()), false);
});

test('email template escapes registration name and ignores untrusted community-link overrides', async () => {
  let requestBody;
  await EMAIL_CORE.sendClaimedJob({
    job_id: 'job-4', email: 'person@example.com', full_name: '<script>alert(1)</script>',
    attempt_count: 1, idempotency_key: 'stable-key', created_at: new Date().toISOString()
  }, {
    apiKey: 'test-key', fromEmail: 'verified@example.com',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: 'resend-message-2' }), { status: 202 });
    },
    finishJob: async (_id, value) => value.outcome
  });

  assert.match(requestBody.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(requestBody.html, /<script>/);
  assert.match(requestBody.html, /chat\.whatsapp\.com/);
});

test('recovery secret comparison is constant-time for equal-length candidates', () => {
  assert.equal(EMAIL_CORE.constantTimeEquals('same-secret', 'same-secret'), true);
  assert.equal(EMAIL_CORE.constantTimeEquals('same-secret', 'other-secret'), false);
  assert.equal(EMAIL_CORE.constantTimeEquals('short', 'longer'), false);
});

test('CORS allows only configured origins and never returns a fallback origin for an attacker', () => {
  const allowed = new Set([
    'http://localhost:3030',
    'https://sirvinciacademy.com',
    'https://sirvinciacademy-waitlist.vercel.app',
    'https://sirvinci-waitlist.vercel.app'
  ]);
  assert.equal(EMAIL_CORE.getCorsHeaders('http://localhost:3030', allowed)['Access-Control-Allow-Origin'], 'http://localhost:3030');
  assert.equal(EMAIL_CORE.getCorsHeaders('https://sirvinciacademy-waitlist.vercel.app', allowed)['Access-Control-Allow-Origin'], 'https://sirvinciacademy-waitlist.vercel.app');
  assert.equal(EMAIL_CORE.getCorsHeaders('https://sirvinci-waitlist.vercel.app', allowed)['Access-Control-Allow-Origin'], 'https://sirvinci-waitlist.vercel.app');
  assert.equal(EMAIL_CORE.getCorsHeaders('https://attacker.invalid', allowed)['Access-Control-Allow-Origin'], undefined);
  assert.equal(EMAIL_CORE.getCorsHeaders(null, allowed)['Access-Control-Allow-Origin'], undefined);
});

test('bulk blocked-job recovery is gated on the exact sender domain being verified', async () => {
  const fetchVerified = async () => new Response(JSON.stringify({
    data: [{ name: 'example.com', status: 'verified' }, { name: 'other.example', status: 'pending' }]
  }), { status: 200 });
  const fetchUnverified = async () => new Response(JSON.stringify({
    data: [{ name: 'example.com', status: 'pending' }]
  }), { status: 200 });

  assert.equal(await EMAIL_CORE.isSenderDomainVerified('test-key', 'sender@example.com', fetchVerified), true);
  assert.equal(await EMAIL_CORE.isSenderDomainVerified('test-key', 'sender@example.com', fetchUnverified), false);
  assert.equal(await EMAIL_CORE.isSenderDomainVerified('test-key', 'sender@other.example', fetchVerified), false);
  assert.equal(await EMAIL_CORE.isSenderDomainVerified('', 'sender@example.com', fetchVerified), false);
});

test('migration provides transactional enqueue, bounded claims, protected recovery RPCs and anon insert-only access', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261011181500_waitlist_email_recovery.sql'), 'utf8');

  assert.match(migration, /AFTER INSERT ON public\.waitlist/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /attempt_count < 6/);
  assert.match(migration, /legacy_delivery_unknown/);
  assert.match(migration, /historical delivery cannot be safely inferred/);
  assert.match(migration, /GRANT INSERT \(full_name, email, canva_experience, main_goal, stopped_reason, payment_pref, expected_cost\)/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.waitlist FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_waitlist_email_jobs/);
  assert.match(migration, /waitlist_email_jobs/);
});
