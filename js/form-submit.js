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

/**
 * POST /api/notify-submission with { source: 'client', table, recordId } — fire-and-forget.
 */
function notifySubmissionAfterInsert(table, recordId) {
  const key = window.INTERNAL_NOTIFY_KEY || '';
  if (!key || !recordId) return;

  const body = JSON.stringify({
    source: 'client',
    table,
    recordId: String(recordId)
  });

  fetch('/api/notify-submission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body
  }).catch((err) => {
    console.warn('notify-submission (client):', err);
  });
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

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'return=representation',
        Accept: 'application/json'
      },
      body: JSON.stringify(rows)
    });

    if (res.ok) {
      let recordId;
      try {
        const data = await res.json();
        const row = Array.isArray(data) ? data[0] : data;
        if (row && typeof row.id === 'string') recordId = row.id;
      } catch {
        /* ignore */
      }
      if (recordId) {
        notifySubmissionAfterInsert(table, recordId);
      }
      return { success: true, recordId };
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
