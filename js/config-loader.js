/**
 * Loads Supabase config from supabase/config.js (or config.example.js as fallback).
 * Sets window.SUPABASE_URL, window.SUPABASE_ANON_KEY, window.INTERNAL_NOTIFY_KEY for forms + email notify.
 */
try {
  const { supabaseConfig } = await import('../supabase/config.js');
  window.SUPABASE_URL = supabaseConfig.url;
  window.SUPABASE_ANON_KEY = supabaseConfig.anonKey;
  window.INTERNAL_NOTIFY_KEY = supabaseConfig.internalNotifyKey || '';
} catch {
  const { supabaseConfig } = await import('../supabase/config.example.js');
  window.SUPABASE_URL = supabaseConfig.url || '';
  window.SUPABASE_ANON_KEY = supabaseConfig.anonKey || '';
  window.INTERNAL_NOTIFY_KEY = supabaseConfig.internalNotifyKey || '';
}
