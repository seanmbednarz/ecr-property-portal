import { createClient } from '@supabase/supabase-js';

// These are the project's PUBLIC values — the URL and the anon (publishable)
// key. They are already baked into every client bundle we ship, and all data
// access is guarded by row-level security, so exposing them here is safe.
//
// They double as build-time fallbacks: CI builds (Cloudflare Workers Builds)
// don't have the local .env, and without a fallback createClient() throws
// "supabaseUrl is required", crashing the whole app to a blank page. Prefer
// the env vars when present (local dev / configured CI); fall back otherwise.
const SUPABASE_URL = 'https://bzduqolubbtpavpvqzep.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6ZHVxb2x1YmJ0cGF2cHZxemVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMTQyMjksImV4cCI6MjA5Njc5MDIyOX0.wv0abz9zh_lUklfrcjhB8z28P_QNMHi4ogrSw3ArTvo';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || SUPABASE_URL;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
