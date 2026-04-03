/**
 * Application form submission to Supabase via PostgREST (native fetch).
 * After a successful insert, notifies /api/notify-submission (same origin) so email can be sent
 * without Supabase Database Webhooks — requires window.INTERNAL_NOTIFY_KEY from config.
 */

function normalizeBaseUrl(url) {
  return String(url).trim().replace(/\/+$/, '');
}

function friendlyNetworkError(message) {
  const m = message || '';
  if (/failed to fetch|networkerror|load failed|aborted|typeerror/i.test(m)) {
    return 'Could not connect. Check your internet connection. If you use an ad blocker or VPN, try allowing this site or try again.';
  }
  return m;
}

/** Primary key for insert — avoids Prefer: return=representation (anon has INSERT but not SELECT on these tables). */
function newRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * POST /api/notify-submission with { source: 'client', table, recordId } — fire-and-forget.
 * Retries once on 404 (rare race before row is readable). Logs non-OK responses for debugging.
 */
function notifySubmissionAfterInsert(table, recordId) {
  const key = window.INTERNAL_NOTIFY_KEY || '';
  if (!key || !recordId) return;

  const body = JSON.stringify({
    source: 'client',
    table,
    recordId: String(recordId)
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`
  };

  const post = () =>
    fetch('/api/notify-submission', {
      method: 'POST',
      headers,
      body,
      credentials: 'same-origin'
    });

  const run = async () => {
    try {
      let res = await post();
      if (res.status === 404) {
        await new Promise((r) => setTimeout(r, 500));
        res = await post();
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(
          'notify-submission:',
          res.status,
          text ? text.slice(0, 200) : '(no body)'
        );
      }
    } catch (err) {
      console.warn('notify-submission (client):', err);
    }
  };

  void run();
}

/**
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 * @returns {Promise<{ success: boolean, error?: string, recordId?: string }>}
 */
async function insertRows(table, rows) {
  const supabaseUrl = window.SUPABASE_URL || '';
  const anonKey = window.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !anonKey) {
    return { success: false, error: 'Configuration missing' };
  }

  let base;
  try {
    base = normalizeBaseUrl(supabaseUrl);
    const parsed = new URL(base);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { success: false, error: 'Invalid Supabase URL' };
    }
  } catch {
    return { success: false, error: 'Invalid Supabase URL' };
  }

  if (/YOUR_PROJECT_REF/i.test(base) || /YOUR_ANON_KEY/i.test(anonKey)) {
    return {
      success: false,
      error:
        'Supabase is not configured for this deployment. Add SUPABASE_URL and SUPABASE_ANON_KEY in your host’s environment variables and redeploy.'
    };
  }

  const endpoint = `${base}/rest/v1/${encodeURIComponent(table)}`;
  const rowsWithIds = rows.map((r) => ({ ...r, id: newRowId() }));
  const recordIdForNotify = rowsWithIds[0] && rowsWithIds[0].id;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(rowsWithIds)
    });

    if (res.ok) {
      if (recordIdForNotify) {
        notifySubmissionAfterInsert(table, recordIdForNotify);
      }
      return { success: true, recordId: recordIdForNotify };
    }

    let errText = `Request failed (${res.status})`;
    try {
      const ct = res.headers.get('content-type');
      if (ct && ct.includes('application/json')) {
        const j = await res.json();
        errText =
          (j.message && String(j.message)) ||
          (j.error_description && String(j.error_description)) ||
          (typeof j.error === 'string' ? j.error : '') ||
          errText;
      } else {
        const t = await res.text();
        if (t) errText = t.slice(0, 500);
      }
    } catch {
      /* keep errText */
    }

    return { success: false, error: errText };
  } catch (err) {
    console.error('Supabase insert:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: friendlyNetworkError(msg) };
  }
}

export async function submitApplicationForm(formData) {
  return insertRows('application_submissions', [
    {
      full_name: formData.fullName,
      email: formData.email,
      phone: formData.phone || null,
      address: formData.address || null,
      date_of_birth: formData.dateOfBirth || null,
      care_needs_description: formData.careNeedsDescription || null,
      preferred_contact_method: formData.preferredContactMethod || null,
      eligibility_result: formData.eligibilityResult || null
    }
  ]);
}

export async function submitCallbackForm(formData) {
  return insertRows('callback_submissions', [
    {
      full_name: formData.fullName,
      email: formData.email,
      phone: formData.phone
    }
  ]);
}
