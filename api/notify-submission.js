/**
 * Email notification after form submissions.
 *
 * Two ways to trigger (use one; no Supabase Database Webhooks required):
 *
 * (A) Client callback (recommended without webhooks)
 *     After a successful insert, the browser POSTs here with the new row id.
 *     Set NOTIFY_WEBHOOK_SECRET in Vercel (or INTERNAL_NOTIFY_KEY as alias) and
 *     the same value in supabase/config.js
 *     as internalNotifyKey (see write-supabase-config.js on deploy).
 *
 * (B) Supabase Database Webhooks (beta) — same URL, Supabase-shaped JSON body.
 *
 * Vercel environment variables:
 *   EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY
 *   EMAILJS_PRIVATE_KEY (optional; recommended for server-side sending)
 *   EMAIL_FROM, NOTIFY_TO_EMAIL, NOTIFY_FALLBACK_TO_EMAIL (optional)
 *   NOTIFY_WEBHOOK_SECRET or INTERNAL_NOTIFY_KEY
 *     (required — shared with client internalNotifyKey for path A)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const TABLES_WITH_EMAIL_STATUS = ['application_submissions', 'callback_submissions'];

let warnedMissingWebhookSecret = false;

/**
 * Vercel may expose JSON as an object, a string, a Buffer, or leave the stream unread.
 */
function parseJsonBodySync(req) {
  const b = req.body;
  if (b === undefined || b === null || b === '') {
    return null;
  }
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(b)) {
    try {
      const raw = b.toString('utf8');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return null;
    }
  }
  if (typeof b === 'object') {
    return b;
  }
  return null;
}

function readRequestBodyStream(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function getJsonPayload(req) {
  const sync = parseJsonBodySync(req);
  if (sync !== null) {
    return sync;
  }
  if (req.method !== 'POST') {
    return {};
  }
  try {
    const buf = await readRequestBodyStream(req);
    const raw = buf.toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

async function fetchRowById(table, recordId) {
  const base = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;

  const url = `${base}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(recordId)}&select=*`;
  const r = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Set email_sent = true on the row after a successful send (service role; bypasses RLS).
 */
async function markEmailSent(table, recordId) {
  if (!TABLES_WITH_EMAIL_STATUS.includes(table) || !recordId) return;

  const base = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.warn(
      'notify-submission: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping email_sent update'
    );
    return;
  }

  const url = `${base}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(recordId)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ email_sent: true })
  });

  if (!r.ok) {
    console.error('notify-submission: Supabase PATCH failed', r.status, await r.text());
  }
}

function getBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function verifyWebhook(req) {
  const secret = process.env.NOTIFY_WEBHOOK_SECRET || process.env.INTERNAL_NOTIFY_KEY;
  if (!secret) {
    if (!warnedMissingWebhookSecret) {
      warnedMissingWebhookSecret = true;
      console.error(
        'notify-submission: NOTIFY_WEBHOOK_SECRET/INTERNAL_NOTIFY_KEY is not set — configure one in Vercel (same value as internalNotifyKey in supabase/config.js)'
      );
    }
    return false;
  }
  const bearer = getBearer(req);
  const headerSecret =
    req.headers['x-notify-secret'] ||
    req.headers['X-Notify-Secret'] ||
    req.headers['x-webhook-secret'];
  return bearer === secret || headerSecret === secret;
}

async function sendEmailJs({ to, subject, body, from }) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const fromEmail = from || process.env.EMAIL_FROM || 'admin@attendanceallowance-foryou.co.uk';

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('Missing EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, or EMAILJS_PUBLIC_KEY');
  }

  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      to_email: to,
      from_email: fromEmail,
      subject,
      message: body
    }
  };

  if (privateKey) {
    payload.accessToken = privateKey;
  }

  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`EmailJS API ${r.status}: ${text.slice(0, 500)}`);
  }
}

const EMAIL_OMIT_KEYS = new Set(['id', 'email_sent', 'traffic_origin']);

function formatCreatedAtForEmail(value) {
  if (value === null || value === undefined) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Europe/London'
  });
}

function isEmptyForEmail(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

function formatRecordLines(record) {
  if (!record || typeof record !== 'object') return '(no data)';
  return Object.entries(record)
    .filter(([k]) => !EMAIL_OMIT_KEYS.has(k))
    .map(([k, v]) => {
      const display =
        k === 'created_at'
          ? formatCreatedAtForEmail(v)
          : v === null || v === undefined
            ? ''
            : String(v);
      return { k, display };
    })
    .filter(({ display }) => !isEmptyForEmail(display))
    .map(({ k, display }) => `${k}: ${display}`)
    .join('\n');
}

/** @param {string} raw */
function parseEligibilityPipe(raw) {
  const out = {};
  const s = String(raw || '').trim();
  if (!s) return out;
  for (const part of s.split('|')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1);
    out[key] = val;
  }
  return out;
}

const ELIGIBILITY_LABELS = {
  outcome: 'Outcome',
  not_eligible_reason: 'Not eligible reason (code)',
  applying_for: 'Applying for',
  state_pension_age: 'State Pension age (66+)',
  pip_dla: 'PIP / DLA / ADP / PADP',
  condition: 'Health condition affects you',
  abroad: 'Absent from GB over 4 weeks at a time (last 3 years)',
  duration: 'How long help needed',
  care_timing: 'When help is needed',
  rate_band: 'Indicative rate',
  estimate_annual: 'Indicative annual amount (£)'
};

const VALUE_LABELS = {
  myself: 'Myself',
  someone_else: 'Someone else',
  yes: 'Yes',
  no: 'No',
  not_sure: 'Not sure',
  six_plus: '6 months or longer',
  terminal: 'Terminally ill (special rules may apply)',
  under: 'Less than 6 months',
  day_only: 'During the day only',
  night_only: 'At night only',
  both: 'During the day and at night',
  lower: 'Lower rate',
  higher: 'Higher rate',
  eligible: 'Eligible (passed screen)',
  not_eligible: 'Not eligible (stopped at screen)'
};

const NOT_ELIGIBLE_REASON_LABELS = {
  spa_no: 'Under State Pension age',
  spa_not_sure: 'Unsure about State Pension age',
  pip_yes: 'Already receives PIP/DLA/ADP/PADP',
  pip_not_sure: 'Unsure about PIP/DLA/ADP/PADP',
  condition_no: 'No health condition indicated',
  abroad_yes: 'Long absence from Great Britain',
  duration_under: 'Help needed for under 6 months',
  generic: 'Other'
};

function humanizeEligibilityValue(key, value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (key === 'not_eligible_reason' && NOT_ELIGIBLE_REASON_LABELS[v]) {
    return `${NOT_ELIGIBLE_REASON_LABELS[v]} (${v})`;
  }
  if (VALUE_LABELS[v]) return VALUE_LABELS[v];
  if (key === 'estimate_annual' && /^\d+$/.test(v)) {
    try {
      return `£${Number(v).toLocaleString('en-GB')}`;
    } catch {
      return v;
    }
  }
  return v.replace(/_/g, ' ');
}

/**
 * Human-readable block for the pipe-separated eligibility_result from the calculator.
 * @param {string | null | undefined} raw
 */
function formatEligibilityResultForEmail(raw) {
  const parsed = parseEligibilityPipe(raw);
  const keys = Object.keys(parsed);
  if (keys.length === 0) return '';

  const order = [
    'outcome',
    'not_eligible_reason',
    'applying_for',
    'state_pension_age',
    'pip_dla',
    'condition',
    'abroad',
    'duration',
    'care_timing',
    'rate_band',
    'estimate_annual'
  ];

  const lines = [];
  for (const key of order) {
    if (!(key in parsed)) continue;
    const val = parsed[key];
    if (val === undefined || val === '') continue;
    const label = ELIGIBILITY_LABELS[key] || key;
    lines.push(`  ${label}: ${humanizeEligibilityValue(key, val)}`);
  }
  for (const key of keys) {
    if (order.includes(key)) continue;
    const val = parsed[key];
    if (val === undefined || val === '') continue;
    lines.push(`  ${key}: ${humanizeEligibilityValue(key, val)}`);
  }
  return lines.join('\n');
}

const APPLICATION_FIELD_LABELS = {
  full_name: 'Name',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  date_of_birth: 'Date of birth',
  care_needs_description: 'Care needs (free text)',
  preferred_contact_method: 'Preferred contact',
  eligibility_result: 'Eligibility (raw)'
};

/**
 * Email body for application_submissions: readable labels + expanded calculator answers.
 * @param {Record<string, unknown>} record
 */
function formatApplicationSubmissionForEmail(record) {
  const lines = ['A new application was submitted.', ''];

  const orderedKeys = [
    'full_name',
    'email',
    'phone',
    'address',
    'date_of_birth',
    'care_needs_description',
    'preferred_contact_method'
  ];

  for (const key of orderedKeys) {
    if (EMAIL_OMIT_KEYS.has(key)) continue;
    let v = record[key];
    if (key === 'created_at') v = record.created_at;
    if (isEmptyForEmail(v)) continue;
    const display =
      key === 'created_at' ? formatCreatedAtForEmail(v) : v === null || v === undefined ? '' : String(v);
    if (isEmptyForEmail(display)) continue;
    const label = APPLICATION_FIELD_LABELS[key] || key;
    lines.push(`${label}: ${display}`);
  }

  const elRaw = record.eligibility_result;
  const elBlock = formatEligibilityResultForEmail(
    typeof elRaw === 'string' ? elRaw : elRaw != null ? String(elRaw) : ''
  );
  if (elBlock) {
    lines.push('');
    lines.push('Eligibility check (from website calculator):');
    lines.push(elBlock);
  } else if (!isEmptyForEmail(elRaw)) {
    lines.push('');
    lines.push(`${APPLICATION_FIELD_LABELS.eligibility_result}:`);
    lines.push(`  ${String(elRaw)}`);
  }

  for (const [k, v] of Object.entries(record)) {
    if (EMAIL_OMIT_KEYS.has(k)) continue;
    if (orderedKeys.includes(k) || k === 'eligibility_result') continue;
    if (isEmptyForEmail(v)) continue;
    const display = k === 'created_at' ? formatCreatedAtForEmail(v) : String(v);
    if (isEmptyForEmail(display)) continue;
    lines.push(`${APPLICATION_FIELD_LABELS[k] || k}: ${display}`);
  }

  const created = record.created_at;
  if (!isEmptyForEmail(created) && !lines.some((l) => l.startsWith('Submitted'))) {
    lines.push('');
    lines.push(`Submitted: ${formatCreatedAtForEmail(created)}`);
  }

  lines.push('');
  return lines.join('\n');
}

function buildEmailContent(payload) {
  const table = payload.table;
  const record = payload.record || {};

  if (table === 'application_submissions') {
    return {
      subject: `AA for You: new application (${record.full_name || 'unknown'})`,
      body: formatApplicationSubmissionForEmail(record)
    };
  }

  if (table === 'callback_submissions') {
    return {
      subject: `AA for You: call back request (${record.full_name || 'unknown'})`,
      body: `A new call back request was submitted.\n\n${formatRecordLines(record)}\n`
    };
  }

  const selfEmail = process.env.NOTIFY_FALLBACK_TO_EMAIL || 'rilrogsa@gmail.com';
  const fromSelf = process.env.EMAIL_FROM || 'admin@attendanceallowance-foryou.co.uk';
  return {
    subject: `[AA for You] New row in ${table}`,
    body: `Event: ${payload.type}\n\n${formatRecordLines(record)}\n`,
    to: selfEmail,
    from: fromSelf
  };
}

function shouldSendEmailForRecord(table, record) {
  if (table !== 'application_submissions') return true;

  const raw = String(record?.eligibility_result || '');
  const parsed = parseEligibilityPipe(raw);

  // New calculator: only notify when the user completed the flow as eligible.
  if ('outcome' in parsed) {
    const o = String(parsed.outcome || '').toLowerCase();
    if (o === 'not_eligible') return false;
    if (o === 'eligible') return true;
  }

  // Legacy (three-question checker): skip obvious fails. Do not use broad "=no" — new strings use pip_dla=no etc.
  if (/(?:^|\|)state_pension_age=no(?:\||$)/i.test(raw)) return false;
  if (/(?:^|\|)daily_activities=no(?:\||$)/i.test(raw)) return false;

  return true;
}

async function runNotifyPipeline(payload) {
  const table = payload.table;
  const record = payload.record || {};
  const recordId = record.id;

  if (!shouldSendEmailForRecord(table, record)) {
    return { skipped: true, reason: 'ineligible_no_answer' };
  }

  const content = buildEmailContent(payload);
  const to =
    content.to !== undefined && content.to !== null
      ? content.to
      : process.env.NOTIFY_TO_EMAIL || 'admin@attendanceallowance-foryou.co.uk';
  await sendEmailJs({
    to,
    subject: content.subject,
    body: content.body,
    from: content.from
  });
  await markEmailSent(table, recordId);
  return { skipped: false };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').send('Method Not Allowed');
    return;
  }

  if (!verifyWebhook(req)) {
    res.status(401).send('Unauthorised');
    return;
  }

  let payload = await getJsonPayload(req);
  if (payload === null) {
    res.status(400).send('Invalid JSON body');
    return;
  }
  if (!payload || typeof payload !== 'object') {
    res.status(400).send('Invalid body');
    return;
  }

  /** Path A: browser calls after insert (no Database Webhooks). */
  if (payload.source === 'client' && payload.table && payload.recordId) {
    const table = payload.table;
    const recordId = String(payload.recordId);

    if (!TABLES_WITH_EMAIL_STATUS.includes(table)) {
      res.status(400).send('Unsupported table');
      return;
    }

    try {
      const record = await fetchRowById(table, recordId);
      if (!record) {
        res.status(404).json({ ok: false, error: 'Row not found' });
        return;
      }
      if (record.email_sent === true) {
        res.status(200).json({ ok: true, skipped: true, reason: 'already_sent' });
        return;
      }

      const synthetic = {
        type: 'INSERT',
        table,
        record
      };
      const result = await runNotifyPipeline(synthetic);
      res.status(200).json({ ok: true, ...result });
    } catch (e) {
      console.error('notify-submission (client):', e);
      const msg = e instanceof Error ? e.message : 'send failed';
      res.status(500).json({ ok: false, error: msg });
    }
    return;
  }

  /** Path B: Supabase Database Webhook payload. */
  if (payload.type !== 'INSERT' || !payload.record) {
    res.status(200).send('Ignored');
    return;
  }

  try {
    const result = await runNotifyPipeline(payload);
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('notify-submission:', e);
    const msg = e instanceof Error ? e.message : 'send failed';
    res.status(500).json({
      ok: false,
      error: msg
    });
  }
};
