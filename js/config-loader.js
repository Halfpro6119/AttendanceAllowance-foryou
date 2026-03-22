/**
 * Loads Supabase config from supabase/config.js (or config.example.js as fallback).
 * Sets window.SUPABASE_URL and window.SUPABASE_ANON_KEY for form submission.
 */
try {
  const { supabaseConfig } = await import('../supabase/config.js');
  window.SUPABASE_URL = supabaseConfig.url;
  window.SUPABASE_ANON_KEY = supabaseConfig.anonKey;
} catch {
  const { supabaseConfig } = await import('../supabase/config.example.js');
  window.SUPABASE_URL = supabaseConfig.url || '';
  window.SUPABASE_ANON_KEY = supabaseConfig.anonKey || '';
}
