
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  return new Response(
    JSON.stringify({ error: "unauthorized" }),
    { status: 401, headers: corsHeaders }
  );
});
