/* ==========================================================================
   SIRVINCI ACADEMY — Interaction, Animations & Supabase Form Controller
   Official Waitlist Integration with PostgreSQL / Supabase
   ========================================================================== */

const SUPABASE_CONFIG = {
  url: 'https://pnkxoktjhzjvjarediid.supabase.co',
  anonKey: 'sb_publishable_ORhuj4o-S8_Fw8BJPmbfAg_yG7hFqky'
};

const WAITLIST_UTILS = {
  emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  normalizeEmail(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  },
  normalizeFullName(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
  },
  isValidEmail(value) {
    const normalizedEmail = WAITLIST_UTILS.normalizeEmail(value);
    return typeof normalizedEmail === 'string' && WAITLIST_UTILS.emailRegex.test(normalizedEmail);
  },
  validateRequiredFields({ fullName, email }) {
    const errors = {};
    const trimmedFullName = WAITLIST_UTILS.normalizeFullName(fullName);
    const trimmedEmail = WAITLIST_UTILS.normalizeEmail(email);

    if (!trimmedFullName) {
      errors.fullName = 'Please enter your full name.';
    }

    if (!trimmedEmail || !WAITLIST_UTILS.isValidEmail(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    return errors;
  },
  parseJsonMaybe(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  },
  buildPayload(formData, nameVal, emailVal) {
    const payload = {
      full_name: WAITLIST_UTILS.normalizeFullName(nameVal),
      email: WAITLIST_UTILS.normalizeEmail(emailVal)
    };

    ['canva_experience', 'main_goal', 'stopped_reason', 'payment_pref', 'expected_cost'].forEach((field) => {
      const value = (formData.get(field) || '').toString().trim();
      if (value) payload[field] = value;
    });

    return payload;
  },
  isDuplicateRegistrationError(response, data) {
    const candidate = data && typeof data === 'object' ? data : {};
    const messageText = [
      candidate.message,
      candidate.error,
      candidate.details,
      candidate.hint
    ].filter((value) => typeof value === 'string').join(' ').toLowerCase();

    if (response && response.status === 409) return true;
    if (messageText.includes('duplicate') || messageText.includes('already registered') || messageText.includes('unique constraint') || messageText.includes('already on the list')) {
      return true;
    }

    return false;
  },
  getEmailLifecycleStatus(response, data) {
    if (!response || typeof response !== 'object') return 'unknown';
    if (data && typeof data === 'object') {
      const normalizedStatus = String(data.status || data.state || data.result || '').toLowerCase();
      const errorCategory = String(data.error_category || '').toLowerCase();

      if (normalizedStatus === 'duplicate') return 'duplicate';
      if (normalizedStatus === 'blocked' || errorCategory === 'configuration_blocked') return 'blocked';
      if (normalizedStatus === 'retryable' || data.retryable === true) return 'retryable';
      if (normalizedStatus === 'uncertain' || errorCategory === 'delivery_uncertain') return 'uncertain';
      if (normalizedStatus === 'failed') return 'error';
      if (normalizedStatus === 'pending' || normalizedStatus === 'processing' || normalizedStatus === 'queued') return 'pending';
      if (response.ok === true && (normalizedStatus === 'accepted' || normalizedStatus === 'sent' || data.ok === true || data.success === true)) return 'accepted';
    }

    if (response.ok === true) return 'accepted';
    return 'error';
  },
  isEmailSendSuccess(response, data) {
    if (!response || response.ok !== true) return false;
    if (!data || typeof data !== 'object') return false;

    const status = String(data.status || '').toLowerCase();
    if (status) return status === 'accepted' || status === 'sent';

    return data.ok === true ||
      data.success === true ||
      data.delivered === true;
  },
  getEmailOutcomeMessage(status) {
    const messages = {
      accepted: 'Your registration is saved, and the confirmation email has been accepted for delivery.',
      pending: 'Your registration is saved, and the confirmation email is queued or being processed.',
      retryable: 'Your registration is saved, and we will retry the confirmation email automatically.',
      blocked: 'Your registration is saved, and the email is queued for recovery once the sender configuration is corrected.',
      uncertain: 'Your registration is saved, but confirmation delivery could not be verified. Please do not register again; recovery will use the same safe delivery key.',
      error: 'Your registration is saved, but the confirmation email could not be sent. Please do not register again.'
    };
    return messages[status] || messages.error;
  },
  getSafeErrorMessage(error, fallback) {
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (error && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
    return fallback;
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initNavbarScroll();
    initScrollAnimations();
    initFaqAccordion();
    initWaitlistForm();
    initSmoothScroll();
  });
}

/* --- 1. Navbar Scroll State --- */
function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const onScroll = () => {
    if (window.scrollY > 20) {
      navbar.classList.add('is-scrolled');
    } else {
      navbar.classList.remove('is-scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* --- 2. Scroll Reveal Animations (Intersection Observer) --- */
function initScrollAnimations() {
  const revealElements = document.querySelectorAll('.scroll-reveal');
  if (!revealElements.length) return;

  if (!('IntersectionObserver' in window)) {
    revealElements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.08
    }
  );

  revealElements.forEach(el => observer.observe(el));
}

/* --- 3. Smooth Anchor Scrolling --- */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#' || !targetId) return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

/* --- 4. FAQ Accordion Interaction --- */
function initFaqAccordion() {
  const triggers = document.querySelectorAll('.faq-trigger');

  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const currentItem = trigger.closest('.faq-item');
      if (!currentItem) return;

      const isAlreadyOpen = currentItem.classList.contains('active');

      // Close other items for focused accordion experience
      document.querySelectorAll('.faq-item.active').forEach(item => {
        if (item !== currentItem) {
          item.classList.remove('active');
          const itemTrigger = item.querySelector('.faq-trigger');
          if (itemTrigger) itemTrigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current item
      if (isAlreadyOpen) {
        currentItem.classList.remove('active');
        trigger.setAttribute('aria-expanded', 'false');
      } else {
        currentItem.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* --- 5. Waitlist Form Validation & Supabase Integration --- */
function initWaitlistForm() {
  const form = document.getElementById('sirvinci-waitlist-form');
  const formCard = document.getElementById('form-card');
  const formContentArea = document.getElementById('form-content-area');
  const formSuccess = document.getElementById('form-success');
  const submitBtn = document.getElementById('submit-btn');
  const errorBanner = document.getElementById('form-error-banner');

  if (!form) return;

  const fullNameInput = document.getElementById('full-name');
  const emailInput = document.getElementById('email');
  const mainGoalSelect = document.getElementById('main-goal');
  const expectedCostInput = document.getElementById('expected-cost');
  let isSubmitting = false;

  const updateFieldAccessibility = (inputEl, isInvalid) => {
    if (!inputEl) return;
    inputEl.setAttribute('aria-invalid', String(isInvalid));

    if (isInvalid) {
      const errorId = inputEl.getAttribute('aria-describedby');
      if (errorId) {
        inputEl.setAttribute('aria-describedby', errorId);
      }
    } else {
      inputEl.removeAttribute('aria-describedby');
    }
  };

  const clearError = (inputEl) => {
    if (!inputEl) return;
    const group = inputEl.closest('.form-group');
    if (group) group.classList.remove('has-error');
    updateFieldAccessibility(inputEl, false);
    if (errorBanner) errorBanner.style.display = 'none';
  };

  const setError = (inputEl, errorMessageId) => {
    if (!inputEl) return;
    const group = inputEl.closest('.form-group');
    if (group) group.classList.add('has-error');
    if (errorMessageId) {
      inputEl.setAttribute('aria-describedby', errorMessageId);
    }
    inputEl.setAttribute('aria-invalid', 'true');
  };

  const showRegistrationSavedButEmailFailed = (messageOverride) => {
    if (!formSuccess) return;
    const title = formSuccess.querySelector('.success-title');
    const body = formSuccess.querySelector('.success-body');

    if (title) {
      title.textContent = 'Registration saved';
    }

    if (body) {
      body.textContent = messageOverride || 'Your waitlist registration was saved, but we could not send the confirmation email. Your registration is still recorded.';
    }

    formContentArea.style.display = 'none';
    formSuccess.classList.add('active');

    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const showRegistrationError = (message) => {
    if (errorBanner) {
      errorBanner.textContent = message;
      errorBanner.style.display = 'block';
    }
  };

  [fullNameInput, emailInput, mainGoalSelect, expectedCostInput].forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => clearError(input));
    input.addEventListener('change', () => clearError(input));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    const nameVal = fullNameInput ? WAITLIST_UTILS.normalizeFullName(fullNameInput.value) : '';
    const emailVal = emailInput ? WAITLIST_UTILS.normalizeEmail(emailInput.value) : '';
    const validationErrors = WAITLIST_UTILS.validateRequiredFields({ fullName: nameVal, email: emailVal });

    if (validationErrors.fullName) {
      setError(fullNameInput, 'full-name-error');
    } else if (fullNameInput) {
      clearError(fullNameInput);
    }

    if (validationErrors.email) {
      setError(emailInput, 'email-error');
    } else if (emailInput) {
      clearError(emailInput);
    }

    if (mainGoalSelect) {
      clearError(mainGoalSelect);
      mainGoalSelect.setAttribute('aria-invalid', 'false');
    }

    if (expectedCostInput) {
      clearError(expectedCostInput);
      expectedCostInput.setAttribute('aria-invalid', 'false');
    }

    if (validationErrors.fullName || validationErrors.email) {
      const firstInvalid = form.querySelector('.form-group.has-error input, .form-group.has-error select');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const formData = new FormData(form);
    const payload = WAITLIST_UTILS.buildPayload(formData, nameVal, emailVal);

    const originalBtnHtml = submitBtn.innerHTML;
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:10px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.8s linear infinite;">
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
        </svg>
        <span>Reserving Spot...</span>
      </span>
    `;

    try {
      const registrationResponse = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/waitlist`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });

      const registrationText = await registrationResponse.text();
      const registrationData = WAITLIST_UTILS.parseJsonMaybe(registrationText);

      if (!registrationResponse.ok) {
        const isDuplicate = WAITLIST_UTILS.isDuplicateRegistrationError(registrationResponse, registrationData);

        if (isDuplicate) {
          let duplicateMessage = 'This email is already on the waitlist. Your existing registration is saved; its confirmation-email status could not be checked. Please do not register again.';
          try {
            const emailStatusResponse = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-welcome-email`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ email: emailVal })
            });
            const emailStatus = WAITLIST_UTILS.parseJsonMaybe(await emailStatusResponse.text());
            const lifecycle = WAITLIST_UTILS.getEmailLifecycleStatus(emailStatusResponse, emailStatus);

            if (lifecycle === 'accepted') {
              duplicateMessage = 'This email is already on the waitlist, and the confirmation email has been accepted for delivery. You do not need to register again.';
            } else if (lifecycle === 'pending') {
              duplicateMessage = 'This email is already on the waitlist. Your confirmation email is queued or being processed; you do not need to register again.';
            } else if (lifecycle === 'blocked') {
              duplicateMessage = 'This email is already on the waitlist. The confirmation email is saved for recovery after sender configuration is corrected.';
            } else if (lifecycle === 'retryable') {
              duplicateMessage = 'This email is already on the waitlist. The confirmation email will be retried automatically.';
            } else if (lifecycle === 'uncertain') {
              duplicateMessage = 'This email is already on the waitlist, but confirmation delivery could not be verified. Please do not register again.';
            } else if (lifecycle === 'error') {
              duplicateMessage = 'This email is already on the waitlist. Your registration remains saved, but confirmation delivery is not currently available.';
            }
          } catch (emailStatusError) {
            console.warn('[Sirvinci Academy] Could not check duplicate registration email status:', emailStatusError);
          }

          showRegistrationError(duplicateMessage);
          formContentArea.style.display = 'block';
          if (formSuccess) formSuccess.classList.remove('active');
          return;
        }

        const message = registrationData && (registrationData.message || registrationData.error)
          ? registrationData.message || registrationData.error
          : `Registration failed (${registrationResponse.status}).`;
        throw new Error(message);
      }

      let emailResponse;
      let emailData;
      try {
        emailResponse = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-welcome-email`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            full_name: nameVal,
            email: emailVal,
            whatsapp_url: 'https://chat.whatsapp.com/DwUFjABTAPCA9BNmIS5SXc'
          })
        });
        emailData = WAITLIST_UTILS.parseJsonMaybe(await emailResponse.text());
      } catch (emailErr) {
        console.warn('[Sirvinci Academy] Email processing response was unavailable after registration saved:', emailErr);
        showRegistrationSavedButEmailFailed(WAITLIST_UTILS.getEmailOutcomeMessage('uncertain'));
        return;
      }

      const emailOutcome = WAITLIST_UTILS.getEmailLifecycleStatus(emailResponse, emailData);
      const emailWasSent = WAITLIST_UTILS.isEmailSendSuccess(emailResponse, emailData);

      if (!emailWasSent) {
        const emailMessage = emailData && (emailData.error || emailData.message)
          ? emailData.error || emailData.message
          : `Your waitlist registration was saved, but the confirmation email could not be sent (${emailResponse.status || 'unknown provider error'}).`;

        console.warn('[Sirvinci Academy] Email send failed after registration saved:', emailMessage);

        showRegistrationSavedButEmailFailed(emailOutcome === 'error'
          ? emailMessage
          : WAITLIST_UTILS.getEmailOutcomeMessage(emailOutcome));
        return;
      }

      formContentArea.style.display = 'none';
      const successTitle = formSuccess.querySelector('.success-title');
      const successBody = formSuccess.querySelector('.success-body');
      if (successTitle) successTitle.textContent = 'You’re on the list!';
      if (successBody) {
        successBody.textContent = 'Your registration is saved, and the confirmation email has been accepted for delivery. We’ll be in touch soon with updates, free previews, and founding member pricing.';
      }
      formSuccess.classList.add('active');

      if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      console.error('Waitlist submission notice:', err);
      showRegistrationError(WAITLIST_UTILS.getSafeErrorMessage(err, 'We could not save your waitlist registration. Please try again.'));
      formContentArea.style.display = 'block';

      if (formSuccess) {
        formSuccess.classList.remove('active');
      }
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  });
}

if (typeof document !== 'undefined') {
  const spinnerStyle = document.createElement('style');
  spinnerStyle.textContent = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
  document.head.appendChild(spinnerStyle);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WAITLIST_UTILS,
    buildWaitlistPayload: WAITLIST_UTILS.buildPayload,
    isValidEmail: WAITLIST_UTILS.isValidEmail,
    parseJsonMaybe: WAITLIST_UTILS.parseJsonMaybe,
    isEmailSendSuccess: WAITLIST_UTILS.isEmailSendSuccess,
    getEmailLifecycleStatus: WAITLIST_UTILS.getEmailLifecycleStatus,
    getSafeErrorMessage: WAITLIST_UTILS.getSafeErrorMessage,
    normalizeEmail: WAITLIST_UTILS.normalizeEmail,
    isDuplicateRegistrationError: WAITLIST_UTILS.isDuplicateRegistrationError
  };
}
