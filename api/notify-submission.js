/**
 * Email notification after form submissions.
 *
 * Two ways to trigger (use one; no Supabase Database Webhooks required):
 *
 * (A) Client callback (recommended without webhooks)
 *     After a successful insert, the browser POSTs here with the new row id.
 *     Set NOTIFY_WEBHOOK_SECRET in Vercel and the same value in supabase/config.js
 *     as internalNotifyKey (see write-supabase-config.js on deploy).
 *
 * (B) Supabase Database Webhooks (beta) — same URL, Supabase-shaped JSON body.
 *
 * Google / Gmail: enable Gmail API, scope gmail.send, npm run google-oauth for refresh token.
 *
 * Vercel environment variables:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   GMAIL_FROM_EMAIL, NOTIFY_TO_EMAIL, NOTIFY_FALLBACK_TO_EMAIL (optional)
 *   NOTIFY_WEBHOOK_SECRET  (required — shared with client internalNotifyKey for path A)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { OAuth2Client } = require('google-auth-library');

const TABLES_WITH_EMAIL_STATUS = ['application_submissions', 'callback_submissions'];

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

async function runNotifyPipeline(payload) {
  const table = payload.table;
  const record = payload.record || {};
  const recordId = record.id;

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
      await runNotifyPipeline(synthetic);
      res.status(200).json({ ok: true });
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
    await runNotifyPipeline(payload);
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
