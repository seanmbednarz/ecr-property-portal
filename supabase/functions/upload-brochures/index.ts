import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BROCHURES = [
  "7600-burnet",
  "arboretum-plaza-ii",
  "austin-oaks-bldg-2",
  "echelon-iv",
  "reunion-park-i",
  "stonebridge-plaza-i",
  "the-park",
  "ufcu-plaza",
];

const SOURCE_BASE = "https://www.ecrtx.com/wp-content/uploads/2026/06";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: { file: string; status: string; error?: string }[] = [];

  for (const slug of BROCHURES) {
    const filename = `${slug}.pdf`;
    const url = `${SOURCE_BASE}/${filename}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      const blob = await res.blob();
      const { error } = await supabase.storage
        .from("brochures")
        .upload(filename, blob, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      results.push({ file: filename, status: "ok" });
    } catch (err: unknown) {
      results.push({ file: filename, status: "error", error: String(err) });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
