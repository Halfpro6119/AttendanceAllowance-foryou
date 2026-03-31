/**
 * Application form submission to Supabase
 * Requires window.SUPABASE_URL and window.SUPABASE_ANON_KEY to be set before use.
 *
 * Client is loaded from jsDelivr (+esm bundle). Avoids esm.sh, which is often blocked
 * by ad blockers or fails with "TypeError: Failed to fetch" on some networks.
 */

const SUPABASE_JS_MODULE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

function friendlyNetworkError(message) {
  const m = message || '';
  if (/failed to fetch|networkerror|load failed|aborted/i.test(m)) {
    return 'Could not connect. Check your internet connection. If you use an ad blocker or VPN, try allowing this site or try again.';
  }
  return m;
}

export async function submitApplicationForm(formData) {
  const supabaseUrl = window.SUPABASE_URL || '';
  const supabaseAnonKey = window.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL and anon key must be set');
    return { success: false, error: 'Configuration missing' };
  }

  try {
    const { createClient } = await import(SUPABASE_JS_MODULE);
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const { error } = await supabaseClient
      .from('application_submissions')
      .insert(
        [
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
        ],
        { returning: 'minimal' }
      );

    if (error) {
      console.error('Supabase insert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('submitApplicationForm:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: friendlyNetworkError(msg) };
  }
}

export async function submitCallbackForm(formData) {
  const supabaseUrl = window.SUPABASE_URL || '';
  const supabaseAnonKey = window.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return { success: false, error: 'Configuration missing' };
  }

  try {
    const { createClient } = await import(SUPABASE_JS_MODULE);
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const { error } = await supabaseClient
      .from('callback_submissions')
      .insert(
        [
          {
            full_name: formData.fullName,
            email: formData.email,
            phone: formData.phone
          }
        ],
        { returning: 'minimal' }
      );

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('submitCallbackForm:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: friendlyNetworkError(msg) };
  }
}
