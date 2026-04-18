/**
 * Main JavaScript for Attendance Allowance for You
 * - Eligibility calculator + lead form (branching, Allowance Assist–style estimates)
 * - Application form submission to Supabase
 * - FAQ accordion, scroll reveal, mobile nav
 */

import { submitApplicationForm } from './form-submit.js';

/**
 * Annual headline figures — lower (day or night only) vs higher (day and night).
 * Aligned with common AA calculator outputs (e.g. Allowance Assist style).
 */
const ESTIMATES = {
  lowerAnnual: 3842,
  higherAnnual: 5740
};

const PROGRESS_STEP_COUNT = 7;

const panelOrder = ['applying', 'spa', 'benefit', 'condition', 'abroad', 'duration', 'care_timing', 'contact'];

const NOT_ELIGIBLE_REASONS = {
  spa_no:
    'Attendance Allowance is for people who have reached State Pension age (currently 66 or older). If you are under State Pension age, you may need to look at Personal Independence Payment (PIP) instead.',
  spa_not_sure:
    'If you are not sure whether you have reached State Pension age, check your date of birth on GOV.UK or contact us—we can help you work out which benefit may apply.',
  pip_yes:
    'You usually cannot get Attendance Allowance if you already receive Personal Independence Payment (PIP), Disability Living Allowance (DLA), Adult Disability Payment (ADP), or Pension Age Disability Payment (PADP).',
  pip_not_sure:
    'If you might be receiving PIP, DLA, ADP, or PADP, you should confirm this before claiming Attendance Allowance. In many cases you cannot receive both.',
  condition_no:
    'Attendance Allowance is based on needing help because of disability or illness. Based on your answer, you may not meet this part of the rules.',
  abroad_yes:
    'Long absences from Great Britain can affect benefit entitlement. Based on your answer, we cannot suggest that you are eligible from this check alone. You may still wish to seek advice about your specific situation.',
  duration_under:
    'Usually you must have needed help for at least 6 months before you can get Attendance Allowance. Different rules can apply if you are terminally ill—speak to your GP or specialist and the DWP about special rules.',
  generic: 'Based on your answers, this benefit may not be the right one for you right now.'
};

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

// FAQ accordion (single open; clicking the open item closes all)
const faqAccordion = document.getElementById('faq-accordion');
faqAccordion?.addEventListener('click', (e) => {
  const trigger = e.target.closest('.faq-trigger');
  if (!trigger || !faqAccordion.contains(trigger)) return;
  const panelId = trigger.getAttribute('aria-controls');
  const panel = panelId ? document.getElementById(panelId) : null;
  const wasOpen = trigger.getAttribute('aria-expanded') === 'true';

  faqAccordion.querySelectorAll('.faq-trigger').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
    const pid = btn.getAttribute('aria-controls');
    const p = pid ? document.getElementById(pid) : null;
    if (p) p.hidden = true;
  });

  if (!wasOpen && panel) {
    trigger.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  }
});

// Eligibility calculator
const questionsContainer = document.getElementById('eligibility-questions');
const eligibilityComplete = document.getElementById('success');
const eligibilityResultInput = document.getElementById('eligibilityResult');
const eligibilityStart = document.getElementById('eligibility-start');
const eligibilityStartBtn = document.getElementById('eligibility-start-btn');
const eligibilityBackBtn = document.getElementById('eligibility-back-btn');
const progressBar = document.getElementById('eligibility-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

/** @type {string[]} stack of panel ids we came from (previous is last pushed) */
let panelStack = [];
/** @type {string | null} */
let currentPanel = null;
const answers = {};

function getCalcPanels() {
  return questionsContainer ? questionsContainer.querySelectorAll('.calc-panel') : [];
}

function hideAllCalcPanels() {
  getCalcPanels().forEach((p) => p.classList.add('hidden'));
}

function clearOptionSelection() {
  questionsContainer?.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
}

function saveAnswerForPanel(panelId, value, rateFromBtn) {
  switch (panelId) {
    case 'applying':
      answers.applyingFor = value;
      break;
    case 'spa':
      answers.spa = value;
      break;
    case 'benefit':
      answers.pipDla = value;
      break;
    case 'condition':
      answers.condition = value;
      break;
    case 'abroad':
      answers.abroad = value;
      break;
    case 'duration':
      answers.duration = value;
      break;
    case 'care_timing':
      answers.careTiming = value;
      answers.rateBand = rateFromBtn || (value === 'both' ? 'higher' : 'lower');
      break;
    default:
      break;
  }
}

function restoreOptionSelection(panelId) {
  const panel = document.getElementById(`calc-panel-${panelId}`);
  if (!panel) return;
  const keyMap = {
    applying: 'applyingFor',
    spa: 'spa',
    benefit: 'pipDla',
    condition: 'condition',
    abroad: 'abroad',
    duration: 'duration',
    care_timing: 'careTiming'
  };
  const key = keyMap[panelId];
  if (!key || answers[key] == null || answers[key] === '') return;
  const saved = answers[key];
  panel.querySelectorAll('.option-btn').forEach((b) => {
    if (b.dataset.value === saved) b.classList.add('selected');
  });
}

function updateProgressUI() {
  if (!progressBar || !progressFill || !progressText) return;
  if (
    currentPanel === 'not_eligible' ||
    currentPanel === null ||
    !questionsContainer ||
    questionsContainer.classList.contains('hidden')
  ) {
    progressBar.classList.add('hidden');
    return;
  }
  const idx = panelOrder.indexOf(currentPanel);
  if (idx < 0) {
    progressBar.classList.add('hidden');
    return;
  }
  progressBar.classList.remove('hidden');
  if (currentPanel === 'contact') {
    progressFill.style.width = '100%';
    progressText.textContent = 'Your details';
    return;
  }
  progressFill.style.width = `${((idx + 1) / PROGRESS_STEP_COUNT) * 100}%`;
  progressText.textContent = `Step ${idx + 1} of ${PROGRESS_STEP_COUNT}`;
}

function updateBackVisibility() {
  const inFlow =
    questionsContainer &&
    !questionsContainer.classList.contains('hidden') &&
    currentPanel &&
    currentPanel !== 'not_eligible';
  const show = Boolean(inFlow && currentPanel !== 'applying');
  eligibilityBackBtn?.classList.toggle('hidden', !show);
}

function showPanel(panelName) {
  hideAllCalcPanels();
  const el = document.getElementById(`calc-panel-${panelName}`);
  if (el) el.classList.remove('hidden');
  currentPanel = panelName;
  clearOptionSelection();
  restoreOptionSelection(panelName);
  updateProgressUI();
  updateBackVisibility();
  requestAnimationFrame(() => {
    const focusTarget = el?.querySelector('.option-btn') || el?.querySelector('input, button, h3');
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
  });
}

function showNotEligible(reasonKey) {
  hideAllCalcPanels();
  const el = document.getElementById('calc-panel-not-eligible');
  el?.classList.remove('hidden');
  currentPanel = 'not_eligible';
  answers.outcome = 'not_eligible';
  answers.notEligibleReason = reasonKey;
  answers.annualEstimate = '';
  answers.rateBand = '';
  answers.careTiming = '';
  const reasonEl = document.getElementById('ineligible-reason');
  if (reasonEl) {
    reasonEl.textContent = NOT_ELIGIBLE_REASONS[reasonKey] || NOT_ELIGIBLE_REASONS.generic;
  }
  eligibilityBackBtn?.classList.add('hidden');
  progressBar?.classList.add('hidden');
  el?.focus();
}

function updateEligibleHeadline() {
  const line = document.getElementById('eligible-amount-line');
  if (!line) return;
  const higher = answers.rateBand === 'higher';
  const amt = higher ? ESTIMATES.higherAnnual : ESTIMATES.lowerAnnual;
  const bandLabel = higher ? 'higher rate' : 'lower rate';
  line.innerHTML = `Based on your answers, you may be eligible for <strong>up to &pound;${amt.toLocaleString(
    'en-GB'
  )}</strong> per year (<strong>${bandLabel}</strong>). Official rates are set by the DWP.`;
}

function buildEligibilityResultSummary() {
  answers.annualEstimate =
    answers.rateBand === 'higher'
      ? String(ESTIMATES.higherAnnual)
      : answers.rateBand === 'lower'
        ? String(ESTIMATES.lowerAnnual)
        : '';
  return [
    `outcome=${answers.outcome || ''}`,
    `not_eligible_reason=${answers.notEligibleReason || ''}`,
    `applying_for=${answers.applyingFor || ''}`,
    `state_pension_age=${answers.spa || ''}`,
    `pip_dla=${answers.pipDla || ''}`,
    `condition=${answers.condition || ''}`,
    `abroad=${answers.abroad || ''}`,
    `duration=${answers.duration || ''}`,
    `care_timing=${answers.careTiming || ''}`,
    `rate_band=${answers.rateBand || ''}`,
    `estimate_annual=${answers.annualEstimate || ''}`
  ].join('|');
}

function clearAnswersAfterPanel(prevId) {
  const idx = panelOrder.indexOf(prevId);
  if (idx < 0) return;
  for (let i = idx + 1; i < panelOrder.length; i++) {
    const p = panelOrder[i];
    if (p === 'spa') delete answers.spa;
    if (p === 'benefit') delete answers.pipDla;
    if (p === 'condition') delete answers.condition;
    if (p === 'abroad') delete answers.abroad;
    if (p === 'duration') delete answers.duration;
    if (p === 'care_timing') {
      delete answers.careTiming;
      delete answers.rateBand;
    }
    if (p === 'contact') {
      delete answers.outcome;
      delete answers.annualEstimate;
      delete answers.notEligibleReason;
    }
  }
}

function navigateForward(fromPanel, toPanel) {
  if (toPanel.startsWith('not_eligible:')) {
    const reason = toPanel.slice('not_eligible:'.length);
    showNotEligible(reason);
    return;
  }
  panelStack.push(fromPanel);
  if (toPanel === 'contact') {
    answers.outcome = 'eligible';
    answers.notEligibleReason = '';
    answers.annualEstimate = answers.rateBand === 'higher' ? ESTIMATES.higherAnnual : ESTIMATES.lowerAnnual;
    updateEligibleHeadline();
  }
  showPanel(toPanel);
  if (toPanel === 'contact' && eligibilityResultInput) {
    eligibilityResultInput.value = buildEligibilityResultSummary();
  }
}

function exitToStart() {
  panelStack = [];
  currentPanel = null;
  hideAllCalcPanels();
  questionsContainer?.classList.add('hidden');
  eligibilityStart?.classList.remove('hidden');
  eligibilityBackBtn?.classList.add('hidden');
  progressBar?.classList.add('hidden');
}

function goBack() {
  if (!currentPanel || currentPanel === 'not_eligible') return;
  if (currentPanel === 'applying') {
    exitToStart();
    return;
  }
  if (panelStack.length === 0) return;
  const prev = panelStack.pop();
  clearAnswersAfterPanel(prev);
  showPanel(prev);
}

function startChecker() {
  eligibilityStart?.classList.add('hidden');
  eligibilityComplete?.classList.add('hidden');
  questionsContainer?.classList.remove('hidden');
  panelStack = [];
  for (const k of Object.keys(answers)) delete answers[k];
  showPanel('applying');
}

function restartChecker() {
  panelStack = [];
  currentPanel = null;
  for (const k of Object.keys(answers)) delete answers[k];
  eligibilityComplete?.classList.add('hidden');
  exitToStart();
  clearOptionSelection();
  const form = document.getElementById('application-form');
  form?.reset();
  const formMessage = document.getElementById('form-message');
  const submitHint = document.getElementById('form-submit-hint');
  submitHint?.classList.add('hidden');
  if (formMessage) {
    formMessage.classList.add('hidden');
    formMessage.classList.remove('success', 'error');
    formMessage.textContent = '';
  }
  if (eligibilityResultInput) eligibilityResultInput.value = '';
  if (window.location.hash === '#success') {
    const path = window.location.pathname + window.location.search;
    history.replaceState(null, '', path);
  }
}

eligibilityStartBtn?.addEventListener('click', startChecker);

questionsContainer?.addEventListener('click', (e) => {
  const btn = e.target.closest('.option-btn');
  if (!btn || !questionsContainer.contains(btn)) return;
  const panelEl = btn.closest('.calc-panel');
  if (!panelEl?.dataset.panel) return;
  const panelId = panelEl.dataset.panel;
  const next = btn.dataset.next;
  if (!next) return;

  const value = btn.dataset.value;
  const rate = btn.dataset.rate || '';
  saveAnswerForPanel(panelId, value, rate);

  panelEl.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');

  if (next.startsWith('not_eligible:')) {
    showNotEligible(next.slice('not_eligible:'.length));
    return;
  }

  navigateForward(panelId, next);
});

eligibilityBackBtn?.addEventListener('click', goBack);

document.querySelectorAll('.calc-restart-btn').forEach((b) => {
  b.addEventListener('click', restartChecker);
});

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

// Application form
const form = document.getElementById('application-form');
const formMessage = document.getElementById('form-message');
const formSubmitHint = document.getElementById('form-submit-hint');

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
  formSubmitHint?.classList.remove('hidden');

  const result = await submitApplicationForm(formData);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit details';
  formSubmitHint?.classList.add('hidden');

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
    panelStack = [];
    for (const k of Object.keys(answers)) delete answers[k];
    currentPanel = null;
    hideAllCalcPanels();
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
