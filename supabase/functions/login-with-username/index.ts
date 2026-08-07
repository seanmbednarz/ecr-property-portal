import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Sign in with a username instead of an email.
//
// Client accounts are shared between people at the client company, so a
// memorable shared username beats passing an inbox address around. Supabase
// Auth is still email+password underneath — this resolves the username to its
// account and performs the sign-in ENTIRELY server-side, so the browser never
// learns the address behind a username (a plain username->email lookup
// endpoint would leak every client's email to anyone who can guess a name).
//
// Returns the same session shape the client SDK expects, which the caller
// hands to supabase.auth.setSession().

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Deliberately identical for "no such username" and "wrong password" so this
// endpoint can't be used to enumerate which usernames exist.
const GENERIC_FAILURE = "Invalid username or password.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let payload: { username?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const username = payload.username?.trim();
  const password = payload.password;

  if (!username || !password) {
    return json({ error: "Missing username or password" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Case-insensitive match, mirroring the unique index on lower(username).
  const { data: profile, error: lookupErr } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (lookupErr) return json({ error: "Sign-in is temporarily unavailable." }, 500);
  if (!profile) return json({ error: GENERIC_FAILURE }, 401);

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(profile.id);
  const email = userRes?.user?.email;
  if (userErr || !email) return json({ error: GENERIC_FAILURE }, 401);

  // Verify the password through the normal auth path with the anon key, so all
  // the usual protections (rate limits, lockouts) still apply.
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: session, error: signInErr } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !session.session) {
    return json({ error: GENERIC_FAILURE }, 401);
  }

  return json({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  });
});
