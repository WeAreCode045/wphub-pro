import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  return new Response(
    JSON.stringify({ error: "unauthorized" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
});
                // Update site plugins
                await supabase.from('sites').update({ plugins: sitePluginsArray, last_connection: new Date().toISOString(), status: 'active' }).eq('id', site.id);
                siteResult.status = 'success';
                results.successful_sites++;
                results.total_plugins_synced += siteResult.plugins_synced;
            } catch (error) {
                siteResult.status = 'failed';
                siteResult.error = error.message;
                results.failed_sites++;
            }
            results.site_results.push(siteResult);
        }
        // Log activity (optional: implement as needed)
        return Response.json({ success: true, message: `Sync voltooid: ${results.successful_sites}/${results.total_sites} sites succesvol`, results });
    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});