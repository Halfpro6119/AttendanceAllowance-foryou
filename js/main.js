/**
 * Main JavaScript for Attendance Allowance for You
 * - Eligibility checker + lead form (4 steps)
 * - Application form submission to Supabase
 * - Scroll reveal animations
 */

import { submitApplicationForm } from './form-submit.js';

const TOTAL_STEPS = 4;

// Scroll reveal
const revealEls = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
);
revealEls.forEach((el) => revealObserver.observe(el));

// Eligibility checker
const questions = document.querySelectorAll('.eligibility-question');
const questionsContainer = document.getElementById('eligibility-questions');
const eligibilityComplete = document.getElementById('success');
const restartBtn = document.getElementById('eligibility-restart');
const eligibilityResultInput = document.getElementById('eligibilityResult');
const eligibilityStart = document.getElementById('eligibility-start');
const eligibilityStartBtn = document.getElementById('eligibility-start-btn');
const eligibilityBackBtn = document.getElementById('eligibility-back-btn');

let currentStep = 1;
let eligibilityAnswers = [];
const progressBar = document.getElementById('eligibility-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

function buildEligibilityResultSummary() {
  const [who, spa, daily] = eligibilityAnswers;
  return [
    `applying_for=${who || ''}`,
    `state_pension_age=${spa || ''}`,
    `daily_activities=${daily || ''}`
  ].join('|');
}

function updateEligibilityBackVisibility() {
  const inQuestions = questionsContainer && !questionsContainer.classList.contains('hidden');
  const show = Boolean(inQuestions && currentStep > 1);
  eligibilityBackBtn?.classList.toggle('hidden', !show);
}

function showQuestion(step) {
  currentStep = step;
  questions.forEach((q) => q.classList.add('hidden'));
  const question = document.querySelector(`.eligibility-question[data-step="${step}"]`);
  if (question) question.classList.remove('hidden');

  questions.forEach((q) => {
    q.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
  });
  const activeQ = document.querySelector(`.eligibility-question[data-step="${step}"]`);
  const saved = eligibilityAnswers[step - 1];
  if (saved && activeQ) {
    activeQ.querySelector(`.option-btn[data-value="${saved}"]`)?.classList.add('selected');
  }

  if (progressBar && progressFill && progressText) {
    progressBar.classList.remove('hidden');
    progressFill.style.width = `${(step / TOTAL_STEPS) * 100}%`;
    progressText.textContent =
      step === TOTAL_STEPS ? 'Your details' : `Question ${step} of ${TOTAL_STEPS}`;
  }
  updateEligibilityBackVisibility();

  if (step === TOTAL_STEPS) {
    if (eligibilityResultInput) {
      eligibilityResultInput.value = buildEligibilityResultSummary();
    }
    requestAnimationFrame(() => {
      document.getElementById('fullName')?.focus();
    });
  }
}

function goBack() {
  if (currentStep <= 1) return;
  if (currentStep === TOTAL_STEPS) {
    showQuestion(TOTAL_STEPS - 1);
    return;
  }
  eligibilityAnswers = eligibilityAnswers.slice(0, currentStep - 2);
  showQuestion(currentStep - 1);
}

function restartChecker() {
  currentStep = 1;
  eligibilityAnswers = [];
  if (eligibilityResultInput) eligibilityResultInput.value = '';
  eligibilityComplete?.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  eligibilityBackBtn?.classList.add('hidden');
  if (eligibilityStart) {
    eligibilityStart.classList.remove('hidden');
    questionsContainer?.classList.add('hidden');
  } else {
    questionsContainer?.classList.remove('hidden');
    showQuestion(1);
  }
  questions.forEach((q) => {
    q.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
  });
  const form = document.getElementById('application-form');
  form?.reset();
  const formMessage = document.getElementById('form-message');
  if (formMessage) {
    formMessage.classList.add('hidden');
    formMessage.classList.remove('success', 'error');
    formMessage.textContent = '';
  }
  if (window.location.hash === '#success') {
    const path = window.location.pathname + window.location.search;
    history.replaceState(null, '', path);
  }
}

function startChecker() {
  if (eligibilityStart) eligibilityStart.classList.add('hidden');
  eligibilityComplete?.classList.add('hidden');
  questionsContainer?.classList.remove('hidden');
  showQuestion(1);
}

eligibilityStartBtn?.addEventListener('click', startChecker);

questions.forEach((questionEl) => {
  questionEl.querySelectorAll('.option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      const step = parseInt(questionEl.dataset.step, 10);

      eligibilityAnswers[step - 1] = value;
      questionEl.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');

      if (step < TOTAL_STEPS) {
        showQuestion(step + 1);
      }
    });
  });
});

eligibilityBackBtn?.addEventListener('click', goBack);

restartBtn?.addEventListener('click', restartChecker);

// Mobile nav toggle + focus trap + Escape
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');

function getNavFocusables() {
  const list = [];
  if (navToggle) list.push(navToggle);
  nav?.querySelectorAll('a').forEach((a) => list.push(a));
  return list;
}

function isNavOpen() {
  return nav?.classList.contains('nav-open');
}

navToggle?.addEventListener('click', () => {
  const expanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!expanded));
  nav?.classList.toggle('nav-open');
  if (!expanded) {
    requestAnimationFrame(() => nav?.querySelector('a')?.focus());
  }
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('nav-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isNavOpen()) {
    nav?.classList.remove('nav-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.focus();
    return;
  }

  if (e.key !== 'Tab' || !isNavOpen()) return;

  const focusables = getNavFocusables();
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function focusEligibilityComplete() {
  const el = document.getElementById('success');
  if (!el) return;
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
}

// Application form (embedded in eligibility step 4)
const form = document.getElementById('application-form');
const formMessage = document.getElementById('form-message');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!eligibilityResultInput) return;

  formMessage?.classList.add('hidden');
  formMessage?.classList.remove('success', 'error');

  eligibilityResultInput.value = buildEligibilityResultSummary();

  const dobEl = form.querySelector('[name="dateOfBirth"]');
  const addressEl = form.querySelector('[name="address"]');
  const careEl = form.querySelector('[name="careNeedsDescription"]');
  const prefEl = form.querySelector('[name="preferredContactMethod"]');

  const formData = {
    fullName: form.querySelector('[name="fullName"]').value.trim(),
    email: form.querySelector('[name="email"]').value.trim(),
    phone: form.querySelector('[name="phone"]')?.value?.trim() || null,
    address: addressEl ? addressEl.value.trim() || null : null,
    dateOfBirth: dobEl ? dobEl.value || null : null,
    careNeedsDescription: careEl ? careEl.value.trim() || null : null,
    preferredContactMethod: prefEl ? prefEl.value || null : null,
    eligibilityResult: eligibilityResultInput.value || null
  };

  const submitBtn = form.querySelector('.btn-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  const result = await submitApplicationForm(formData);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit';

  if (result.success) {
    if (typeof window.gtag_report_conversion === 'function') {
      window.gtag_report_conversion();
    }
    questionsContainer?.classList.add('hidden');
    progressBar?.classList.add('hidden');
    eligibilityBackBtn?.classList.add('hidden');
    eligibilityComplete?.classList.remove('hidden');
    form.reset();
    eligibilityResultInput.value = '';
    eligibilityAnswers = [];
    const path = window.location.pathname + window.location.search;
    history.replaceState(null, '', `${path}#success`);
    focusEligibilityComplete();
    return;
  }

  formMessage?.classList.remove('hidden');
  formMessage?.classList.add('error');
  formMessage.textContent = result.error || 'Something went wrong. Please try again or contact us.';
  formMessage?.setAttribute('tabindex', '-1');
  formMessage?.focus({ preventScroll: false });
});
