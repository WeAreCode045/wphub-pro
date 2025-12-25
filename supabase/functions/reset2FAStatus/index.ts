import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    // TODO: Implement user authentication and lookup
    // For now, return unauthorized
    return Response.json({ success: false, error: 'Unauthorized (auth not implemented)' }, { status: 401 });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
