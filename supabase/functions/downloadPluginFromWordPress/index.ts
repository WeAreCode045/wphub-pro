import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Dummy uploadToStorage for demonstration (replace with your actual implementation)
async function uploadToStorage(fileName: string, data: Uint8Array, bucket: string, contentType: string) {
  // ...upload logic here...
  return { file_url: `https://storage.example.com/${bucket}/${fileName}` };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  // Require authentication
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer /i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });
  }

  // Supabase client (service role)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { plugin_slug } = body;
    if (!plugin_slug) {
      return jsonResponse({ error: "Missing required parameter: plugin_slug" }, 400);
    }

    // Download plugin zip from WordPress.org (dummy logic, replace with actual fetch)
    // Example: const response = await fetch(`https://downloads.wordpress.org/plugin/${plugin_slug}.zip`);
    // const zipBytes = new Uint8Array(await response.arrayBuffer());
    // For demonstration, use dummy data:
    const zipBytes = new Uint8Array([80, 75, 3, 4]); // PKZIP header
    const result = { plugin_data: { version: "1.0.0" } };

    const fileName = `${plugin_slug}-v${result.plugin_data?.version || "unknown"}.zip`;
    const uploadRes = await uploadToStorage(fileName, zipBytes, "uploads", "application/zip");

    return jsonResponse({ success: true, plugin_data: result.plugin_data, file_url: uploadRes.file_url });
  } catch (err: any) {
    console.error("downloadPluginFromWordPress error", err);
    return jsonResponse({ error: err.message || String(err) }, 500);
  }
});
