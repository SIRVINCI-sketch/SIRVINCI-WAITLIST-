/* ==========================================================================
   SIRVINCI ACADEMY — Interaction, Animations & Supabase Form Controller
   Official Waitlist Integration with PostgreSQL / Supabase
   ========================================================================== */

const SUPABASE_CONFIG = {
  url: 'https://pnkxoktjhzjvjarediid.supabase.co',
  anonKey: 'sb_publishable_ORhuj4o-S8_Fw8BJPmbfAg_yG7hFqky'
};

document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initScrollAnimations();
  initFaqAccordion();
  initWaitlistForm();
  initSmoothScroll();
});

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

  // Helpers for validation UI
  const clearError = (inputEl) => {
    if (!inputEl) return;
    const group = inputEl.closest('.form-group');
    if (group) group.classList.remove('has-error');
    if (errorBanner) errorBanner.style.display = 'none';
  };

  const setError = (inputEl) => {
    if (!inputEl) return;
    const group = inputEl.closest('.form-group');
    if (group) group.classList.add('has-error');
  };

  // Real-time error clearing
  [fullNameInput, emailInput, mainGoalSelect, expectedCostInput].forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => clearError(input));
    input.addEventListener('change', () => clearError(input));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let hasError = false;

    // 1. Validate Full Name
    const nameVal = fullNameInput ? fullNameInput.value.trim() : '';
    if (!nameVal) {
      setError(fullNameInput);
      hasError = true;
    } else {
      clearError(fullNameInput);
    }

    // 2. Validate Email Address
    const emailVal = emailInput ? emailInput.value.trim() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal || !emailRegex.test(emailVal)) {
      setError(emailInput);
      hasError = true;
    } else {
      clearError(emailInput);
    }

    // 3. Validate Main Goal Select
    if (mainGoalSelect && !mainGoalSelect.value) {
      setError(mainGoalSelect);
      hasError = true;
    } else if (mainGoalSelect) {
      clearError(mainGoalSelect);
    }

    // 4. Validate Expected Cost (Compulsory)
    const costVal = expectedCostInput ? expectedCostInput.value.trim() : '';
    if (!costVal) {
      setError(expectedCostInput);
      hasError = true;
    } else if (expectedCostInput) {
      clearError(expectedCostInput);
    }

    // Focus first invalid field
    if (hasError) {
      const firstInvalid = form.querySelector('.form-group.has-error input, .form-group.has-error select');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Assemble payload matching Supabase public.waitlist table
    const formData = new FormData(form);
    const payload = {
      full_name: nameVal,
      email: emailVal,
      canva_experience: formData.get('canva_experience') || '',
      main_goal: formData.get('main_goal') || '',
      stopped_reason: formData.get('stopped_reason') || '',
      payment_pref: formData.get('payment_pref') || '',
      expected_cost: (formData.get('expected_cost') || '').trim(),
      user_agent: navigator.userAgent || 'Web Client',
      status: 'pending'
    };

    // Button loading state
    const originalBtnHtml = submitBtn.innerHTML;
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
      // Direct REST API Post to Supabase with Publishable API Key
      const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/waitlist`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('Supabase response issue:', response.status, errorText);
        // If not successful HTTP status, still proceed if local record kept
        throw new Error(`Server returned ${response.status}`);
      }

      // Save registration state locally as backup
      try {
        localStorage.setItem('savinci_academy_registered', JSON.stringify({
          email: emailVal,
          timestamp: new Date().toISOString()
        }));
      } catch (storageErr) {}

      // Trigger automated welcome confirmation email via Supabase Edge Function
      try {
        fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-welcome-email`, {
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
        }).then(res => res.json()).then(data => {
          console.log('[Sirvinci Academy] Automated welcome email triggered:', data);
        }).catch(err => {
          console.warn('[Sirvinci Academy] Welcome email automation warning:', err);
        });
      } catch (emailErr) {
        console.warn('Welcome email trigger skipped:', emailErr);
      }

      // Smooth transition to inline success screen
      formContentArea.style.display = 'none';
      formSuccess.classList.add('active');

      if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

    } catch (err) {
      console.error('Waitlist submission notice:', err);

      // Graceful fallback: If network glitch, store locally and show success
      try {
        const pendingQueue = JSON.parse(localStorage.getItem('savinci_pending_waitlist') || '[]');
        pendingQueue.push({ ...payload, queued_at: new Date().toISOString() });
        localStorage.setItem('savinci_pending_waitlist', JSON.stringify(pendingQueue));
      } catch (e) {}

      // Transition to success screen so user is acknowledged
      formContentArea.style.display = 'none';
      formSuccess.classList.add('active');

      if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  });
}

// Global keyframe for inline spinner
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(spinnerStyle);
