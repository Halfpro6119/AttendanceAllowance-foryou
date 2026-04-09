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
  const fromSelf = process.env.EMAIL_FROM || 'admin@attendanceallowance-foryou.co.uk';
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
  await sendEmailJs({
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
