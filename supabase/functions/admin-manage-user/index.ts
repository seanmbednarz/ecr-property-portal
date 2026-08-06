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

const ROLES = ["admin", "broker", "client"] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Verify the caller's session.
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

  // Only admins may manage users.
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (callerProfile?.role !== "admin") {
    return json({ error: "Forbidden: admin only" }, 403);
  }

  let payload: {
    action?: string;
    target_id?: string;
    email?: string;
    password?: string;
    role?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = payload.action;
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password?.trim();
  const role = payload.role;

  if (password !== undefined && password.length < 6) {
    return json({ error: "Password must be at least 6 characters" }, 400);
  }
  if (role !== undefined && !ROLES.includes(role as typeof ROLES[number])) {
    return json({ error: "Invalid role" }, 400);
  }

  // ── CREATE ────────────────────────────────────────────────────────────
  if (action === "create") {
    if (!email) return json({ error: "Missing email" }, 400);
    if (!password) return json({ error: "Missing password" }, 400);

    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) return json({ error: createErr.message }, 400);
    const userId = createData.user.id;

    // handle_new_user seeds a profile row from the email domain; override the
    // role if the admin picked one explicitly.
    if (role) {
      const { error: profErr } = await admin
        .from("profiles")
        .upsert({ id: userId, role }, { onConflict: "id" });
      if (profErr) return json({ error: profErr.message }, 500);
    }
    return json({ ok: true, user_id: userId, created: true });
  }

  // ── DELETE ────────────────────────────────────────────────────────────
  if (action === "delete") {
    const targetId = payload.target_id;
    if (!targetId) return json({ error: "Missing target_id" }, 400);
    if (targetId === user.id) {
      return json({ error: "You can't delete your own account" }, 400);
    }

    // Refuse to delete the last remaining admin.
    const { data: target } = await admin
      .from("profiles")
      .select("role")
      .eq("id", targetId)
      .maybeSingle();
    if (target?.role === "admin") {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return json({ error: "Cannot delete the last remaining admin" }, 400);
      }
    }

    // profiles.id references auth.users ON DELETE CASCADE, so the profile row
    // is removed automatically.
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) return json({ error: delErr.message }, 400);
    return json({ ok: true, user_id: targetId, deleted: true });
  }

  // ── UPDATE (email and/or password) ────────────────────────────────────
  if (action === "update") {
    const targetId = payload.target_id;
    if (!targetId) return json({ error: "Missing target_id" }, 400);
    if (!email && !password) {
      return json({ error: "Nothing to update: provide an email and/or password" }, 400);
    }

    const attrs: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email) { attrs.email = email; attrs.email_confirm = true; }
    if (password) attrs.password = password;

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, attrs);
    if (updErr) return json({ error: updErr.message }, 400);
    return json({ ok: true, user_id: targetId });
  }

  return json({ error: "Unknown action; expected 'create', 'update', or 'delete'" }, 400);
});
