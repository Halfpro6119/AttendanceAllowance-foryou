/**
 * Main JavaScript for Attendance Allowance for You
 * - Eligibility checker
 * - Application form submission to Supabase
 * - Callback form submission to Supabase
 * - Scroll reveal animations
 */

import { submitApplicationForm, submitCallbackForm } from './form-submit.js';

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
const resultContainer = document.getElementById('eligibility-result');
const resultSuccess = document.getElementById('eligibility-success');
const resultFail = document.getElementById('eligibility-fail');
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
    progressFill.style.width = `${(step / 5) * 100}%`;
    progressText.textContent = `Question ${step} of 5`;
  }
  updateEligibilityBackVisibility();
}

function showResult(eligible) {
  questionsContainer.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  if (eligibilityStart) eligibilityStart.classList.add('hidden');
  eligibilityBackBtn?.classList.add('hidden');
  resultContainer.classList.remove('hidden');
  if (eligible) {
    resultSuccess.classList.remove('hidden');
    resultFail.classList.add('hidden');
    eligibilityResultInput.value = 'eligible';
  } else {
    resultSuccess.classList.add('hidden');
    resultFail.classList.remove('hidden');
    eligibilityResultInput.value = 'not_eligible';
  }
}

function goBack() {
  if (currentStep <= 1) return;
  eligibilityAnswers = eligibilityAnswers.slice(0, currentStep - 2);
  showQuestion(currentStep - 1);
}

function restartChecker() {
  currentStep = 1;
  eligibilityAnswers = [];
  eligibilityResultInput.value = '';
  resultContainer.classList.add('hidden');
  resultSuccess.classList.add('hidden');
  resultFail.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  eligibilityBackBtn?.classList.add('hidden');
  if (eligibilityStart) {
    eligibilityStart.classList.remove('hidden');
    questionsContainer.classList.add('hidden');
  } else {
    questionsContainer.classList.remove('hidden');
    showQuestion(1);
  }
  questions.forEach((q) => {
    q.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
  });
}

function startChecker() {
  if (eligibilityStart) eligibilityStart.classList.add('hidden');
  questionsContainer.classList.remove('hidden');
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

      if (value === 'no' && (step === 1 || step === 2 || step === 3)) {
        showResult(false);
        return;
      }
      if (step === 4 && value === 'no') {
        showResult(false);
        return;
      }
      if (step === 5) {
        showResult(value === 'yes');
        return;
      }

      showQuestion(step + 1);
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

function focusFormMessage(el) {
  if (!el) return;
  el.classList.remove('hidden');
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
}

// Application form
const form = document.getElementById('application-form');
const formMessage = document.getElementById('form-message');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMessage.classList.add('hidden');
  formMessage.classList.remove('success', 'error');

  const dateOfBirth = form.querySelector('[name="dateOfBirth"]').value;
  const formData = {
    fullName: form.querySelector('[name="fullName"]').value.trim(),
    email: form.querySelector('[name="email"]').value.trim(),
    phone: form.querySelector('[name="phone"]')?.value?.trim() || null,
    address: form.querySelector('[name="address"]')?.value?.trim() || null,
    dateOfBirth: dateOfBirth || null,
    careNeedsDescription: form.querySelector('[name="careNeedsDescription"]')?.value?.trim() || null,
    preferredContactMethod: form.querySelector('[name="preferredContactMethod"]')?.value || null,
    eligibilityResult: form.querySelector('[name="eligibilityResult"]')?.value || null
  };

  const submitBtn = form.querySelector('.btn-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  const result = await submitApplicationForm(formData);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit Application';

  formMessage.classList.remove('hidden');
  if (result.success) {
    formMessage.classList.add('success');
    formMessage.textContent = 'Thank you! Your application has been received. We\'ll be in touch soon.';
    form.reset();
    eligibilityResultInput.value = '';
    focusFormMessage(formMessage);
  } else {
    formMessage.classList.add('error');
    formMessage.textContent = result.error || 'Something went wrong. Please try again or contact us.';
    focusFormMessage(formMessage);
  }
});

// Callback form
const callbackForm = document.getElementById('callback-form');
const callbackMessage = document.getElementById('callback-message');

callbackForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  callbackMessage.classList.add('hidden');
  callbackMessage.classList.remove('success', 'error');

  const formData = {
    fullName: callbackForm.querySelector('[name="callbackName"]').value.trim(),
    email: callbackForm.querySelector('[name="callbackEmail"]').value.trim(),
    phone: callbackForm.querySelector('[name="callbackPhone"]').value.trim()
  };

  const submitBtn = callbackForm.querySelector('.btn-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  const result = await submitCallbackForm(formData);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Request call-back';

  callbackMessage.classList.remove('hidden');
  if (result.success) {
    callbackMessage.classList.add('success');
    callbackMessage.textContent = 'Thank you! We\'ll call you back soon.';
    callbackForm.reset();
    focusFormMessage(callbackMessage);
  } else {
    callbackMessage.classList.add('error');
    callbackMessage.textContent = result.error || 'Something went wrong. Please try again or call us.';
    focusFormMessage(callbackMessage);
  }
});
