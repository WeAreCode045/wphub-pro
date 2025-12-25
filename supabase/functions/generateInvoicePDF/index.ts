import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('Generate invoice PDF error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to generate PDF' }), { status: 500, headers: CORS_HEADERS });
  }
});