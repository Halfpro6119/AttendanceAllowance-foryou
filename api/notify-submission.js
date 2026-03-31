/**
 * Supabase Database Webhook → Gmail notification.
 *
 * Setup (Google Cloud Console — same project as your OAuth client):
 * 1. APIs & Services → Enable "Gmail API" (Drive alone does not send mail).
 * 2. OAuth consent screen → add scope: https://www.googleapis.com/auth/gmail.send
 * 3. Use your existing OAuth client ID + secret; run: npm run google-oauth
 *    Copy the refresh token into Vercel env GOOGLE_REFRESH_TOKEN.
 *
 * Vercel environment variables:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 *   GMAIL_FROM_EMAIL=rilrogsa@gmail.com   (must match the Google account that authorized)
 *   NOTIFY_TO_EMAIL=admin@attendanceallowance-foryou.co.uk
 *   NOTIFY_FALLBACK_TO_EMAIL=rilrogsa@gmail.com   (optional; default: you — only used for generic / unknown-table rows)
 *   NOTIFY_WEBHOOK_SECRET=long-random-string
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...   (Dashboard → Settings → API — server only, never expose to the browser)
 *
 * Supabase: Database → Webhooks → create one per table (INSERT only):
 *   URL: https://YOUR-DOMAIN.vercel.app/api/notify-submission
 *   HTTP header: Authorization: Bearer <NOTIFY_WEBHOOK_SECRET>
 *   Tables: application_submissions, callback_submissions
 */

const { OAuth2Client } = require('google-auth-library');

const TABLES_WITH_EMAIL_STATUS = ['application_submissions', 'callback_submissions'];

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
  const secret = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!secret) return false;
  const bearer = getBearer(req);
  const headerSecret =
    req.headers['x-notify-secret'] ||
    req.headers['X-Notify-Secret'] ||
    req.headers['x-webhook-secret'];
  return bearer === secret || headerSecret === secret;
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeSubject(s) {
  if (!/[^\x00-\x7F]/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function buildMime({ from, to, subject, body }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body
  ];
  return lines.join('\r\n');
}

async function sendGmail({ to, subject, body, from }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const fromEmail = from || process.env.GMAIL_FROM_EMAIL || 'rilrogsa@gmail.com';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN');
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  const { token } = await oauth2.getAccessToken();
  if (!token) throw new Error('Could not obtain Google access token');

  const raw = toBase64Url(buildMime({ from: fromEmail, to, subject, body }));

  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Gmail API ${r.status}: ${t.slice(0, 500)}`);
  }
}

function formatRecordLines(record) {
  if (!record || typeof record !== 'object') return '(no data)';
  return Object.entries(record)
    .map(([k, v]) => `${k}: ${v === null || v === undefined ? '' : String(v)}`)
    .join('\n');
}

function buildEmailContent(payload) {
  const table = payload.table;
  const record = payload.record || {};

  if (table === 'application_submissions') {
    return {
      subject: `AA for You New application — ${record.full_name || 'unknown'}`,
      body: `A new application was submitted.\n\n${formatRecordLines(record)}\n`
    };
  }

  if (table === 'callback_submissions') {
    return {
      subject: `AA for You New call-back request — ${record.full_name || 'unknown'}`,
      body: `A new call-back request was submitted.\n\n${formatRecordLines(record)}\n`
    };
  }

  const selfEmail = process.env.NOTIFY_FALLBACK_TO_EMAIL || 'rilrogsa@gmail.com';
  const fromSelf = process.env.GMAIL_FROM_EMAIL || 'rilrogsa@gmail.com';
  return {
    subject: `[AA for You] New row in ${table}`,
    body: `Event: ${payload.type}\n\n${formatRecordLines(record)}\n`,
    to: selfEmail,
    from: fromSelf
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').send('Method Not Allowed');
    return;
  }

  if (!verifyWebhook(req)) {
    res.status(401).send('Unauthorized');
    return;
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch {
      res.status(400).send('Invalid JSON body');
      return;
    }
  }
  if (!payload || typeof payload !== 'object') {
    res.status(400).send('Invalid body');
    return;
  }

  if (payload.type !== 'INSERT' || !payload.record) {
    res.status(200).send('Ignored');
    return;
  }

  const table = payload.table;
  const recordId = payload.record.id;

  try {
    const content = buildEmailContent(payload);
    const to =
      content.to !== undefined && content.to !== null
        ? content.to
        : process.env.NOTIFY_TO_EMAIL || 'admin@attendanceallowance-foryou.co.uk';
    await sendGmail({
      to,
      subject: content.subject,
      body: content.body,
      from: content.from
    });
    await markEmailSent(table, recordId);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('notify-submission:', e);
    const msg = e instanceof Error ? e.message : 'send failed';
    res.status(500).json({
      ok: false,
      error: msg
    });
  }
};
