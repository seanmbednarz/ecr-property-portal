import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Verify the user is an admin or broker using their JWT
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Service role client — bypasses RLS for storage and table writes
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Check user is admin or broker (or @ecrtx.com email)
  const isEcrEmail = user.email?.endsWith("@ecrtx.com") ?? false;
  if (!isEcrEmail) {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || !["admin", "broker"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const file = formData.get("file") as File | null;
  const propertyId = formData.get("property_id") as string | null;
  const slug = formData.get("slug") as string | null;

  if (!file || !propertyId || !slug) {
    return new Response(JSON.stringify({ error: "Missing file, property_id, or slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const path = `${slug}.pdf`;
  const arrayBuffer = await file.arrayBuffer();

  // Upload using service role — bypasses RLS
  const { error: uploadError } = await admin.storage
    .from("brochures")
    .upload(path, arrayBuffer, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    return new Response(JSON.stringify({ error: uploadError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { data: urlData } = admin.storage.from("brochures").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  // Update property record
  const { error: updateError } = await admin
    .from("properties")
    .update({ brochure_url: publicUrl })
    .eq("id", propertyId);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ url: publicUrl }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
