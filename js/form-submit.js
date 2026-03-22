/**
 * Application form submission to Supabase
 * Requires window.SUPABASE_URL and window.SUPABASE_ANON_KEY to be set before use.
 */

export async function submitApplicationForm(formData) {
  const supabaseUrl = window.SUPABASE_URL || '';
  const supabaseAnonKey = window.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL and anon key must be set');
    return { success: false, error: 'Configuration missing' };
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  const { error } = await supabaseClient
    .from('application_submissions')
    .insert([
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
    ], { returning: 'minimal' });

  if (error) {
    console.error('Supabase insert error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function submitCallbackForm(formData) {
  const supabaseUrl = window.SUPABASE_URL || '';
  const supabaseAnonKey = window.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return { success: false, error: 'Configuration missing' };
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  const { error } = await supabaseClient
    .from('callback_submissions')
    .insert([
      {
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone
      }
    ], { returning: 'minimal' });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
