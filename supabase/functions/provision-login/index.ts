import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Verify the caller is authenticated.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const callerRole = callerProfile?.role;

  let payload: {
    email?: string;
    password?: string;
    role?: string;
    broker_id?: string | null;
    client_id?: string | null;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = payload.email?.trim().toLowerCase();
  const password = payload.password?.trim();
  const role = payload.role;

  if (!email) return json({ error: "Missing email" }, 400);
  if (!password || password.length < 6) {
    return json({ error: "Password must be at least 6 characters" }, 400);
  }
  if (role !== "broker" && role !== "client") {
    return json({ error: "role must be 'broker' or 'client'" }, 400);
  }

  // Admins may mint any login; brokers may mint client logins only.
  const allowed = callerRole === "admin" || (callerRole === "broker" && role === "client");
  if (!allowed) {
    return json({ error: "Forbidden: not permitted to create this login" }, 403);
  }

  // Clients are scoped to a client_id; brokers to a broker_id.
  const broker_id = role === "broker" ? (payload.broker_id ?? null) : null;
  const client_id = role === "client" ? (payload.client_id ?? null) : null;

  // Create the auth user, or update the password if it already exists.
  let userId: string | null = null;
  let created = false;
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    // Likely "email already registered" — find and update instead.
    let found = null as null | { id: string };
    for (let page = 1; page <= 20 && !found; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) return json({ error: listErr.message }, 500);
      found = list.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
      if (list.users.length < 200) break;
    }
    if (!found) return json({ error: createErr.message }, 500);
    userId = found.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) return json({ error: updErr.message }, 500);
  } else {
    userId = createData.user.id;
    created = true;
  }

  // Force the profile to the intended role + link, overriding the
  // handle_new_user default (which keys role off the @ecrtx.com domain).
  const { error: profErr } = await admin
    .from("profiles")
    .upsert({ id: userId, role, broker_id, client_id }, { onConflict: "id" });
  if (profErr) return json({ error: profErr.message }, 500);

  return json({ ok: true, user_id: userId, created });
});
