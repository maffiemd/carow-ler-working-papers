// Shared Supabase client for the public site.
// window.SUPABASE_URL / window.SUPABASE_ANON_KEY are injected by _includes/footer.html
// from _config.yml. The anon key is intentionally public: Row Level Security on the
// `subscribers` table only allows INSERT + the narrow unsubscribe() RPC for this key,
// so it can never be used to read or dump the subscriber list. See supabase/schema.sql.
window.supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);
