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
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
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

let currentStep = 1;
let eligibilityAnswers = [];
const progressBar = document.getElementById('eligibility-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

function showQuestion(step) {
  questions.forEach((q) => q.classList.add('hidden'));
  const question = document.querySelector(`.eligibility-question[data-step="${step}"]`);
  if (question) question.classList.remove('hidden');
  if (progressBar && progressFill && progressText) {
    progressBar.classList.remove('hidden');
    progressFill.style.width = `${(step / 5) * 100}%`;
    progressText.textContent = `Question ${step} of 5`;
  }
}

function showResult(eligible) {
  questionsContainer.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  if (eligibilityStart) eligibilityStart.classList.add('hidden');
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

function restartChecker() {
  currentStep = 1;
  eligibilityAnswers = [];
  eligibilityResultInput.value = '';
  resultContainer.classList.add('hidden');
  resultSuccess.classList.add('hidden');
  resultFail.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
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
      eligibilityAnswers.push(value);
      btn.classList.add('selected');

      if (value === 'no' && (currentStep === 1 || currentStep === 2 || currentStep === 3)) {
        showResult(false);
        return;
      }
      if (currentStep === 4 && value === 'no') {
        showResult(false);
        return;
      }
      if (currentStep === 5) {
        showResult(value === 'yes');
        return;
      }

      currentStep++;
      showQuestion(currentStep);
    });
  });
});

restartBtn?.addEventListener('click', restartChecker);

// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');

navToggle?.addEventListener('click', () => {
  const expanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', !expanded);
  nav?.classList.toggle('nav-open');
});

// Close mobile nav when clicking a link
nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('nav-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  });
});

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
  } else {
    formMessage.classList.add('error');
    formMessage.textContent = result.error || 'Something went wrong. Please try again or contact us.';
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
  } else {
    callbackMessage.classList.add('error');
    callbackMessage.textContent = result.error || 'Something went wrong. Please try again or call us.';
  }
});
