import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Server-side fetch of a remote image/PDF so the browser can re-use it without
// hitting CORS. Returns the raw bytes; the client then resizes + stores them in
// our own bucket ("internalizing" pasted external links).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err(401, "Unauthorized");

  // Verify caller is an authenticated user.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return err(401, "Unauthorized");

  let target: string | undefined;
  try {
    target = (await req.json())?.url;
  } catch {
    return err(400, "Invalid JSON body");
  }
  if (!target || !/^https?:\/\//i.test(target)) return err(400, "A valid http(s) url is required");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      headers: {
        // Some hosts block default fetch UAs; present a normal browser UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "image/*,application/pdf,*/*",
      },
    });
  } catch (e) {
    return err(502, `Could not reach the URL: ${(e as Error)?.message ?? "fetch failed"}`);
  }
  if (!upstream.ok) return err(502, `The URL returned ${upstream.status}`);

  const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim() ||
    "application/octet-stream";
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
    return err(415, `Unsupported content type: ${contentType}`);
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return err(413, "File is larger than 25 MB");

  return new Response(buf, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": contentType },
  });
});
