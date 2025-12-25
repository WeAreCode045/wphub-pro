import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  return new Response(
    JSON.stringify({ error: "unauthorized" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
});

            const responseText = await response.text();
            console.log(`[simulatePluginSync] WordPress response status: ${response.status}`);
            console.log(`[simulatePluginSync] WordPress response body:`, responseText);

            if (response.ok) {
                return Response.json({ 
                    success: true,
                    message: 'Sync triggered successfully on WordPress site',
                    site_name: site.name,
                    wp_response: responseText
                });
            } else {
                console.log(`[simulatePluginSync] WordPress sync failed, will sync on next cron`);
                return Response.json({ 
                    success: true,
                    message: 'Sync will be executed on next scheduled check',
                    site_name: site.name,
                    note: 'Direct trigger not available, changes marked as pending',
                    wp_status: response.status,
                    wp_response: responseText
                });
            }
        } catch (wpError) {
            console.error(`[simulatePluginSync] WordPress connection error:`, wpError);
            return Response.json({ 
                success: true,
                message: 'Changes marked as pending, will sync on next scheduled check',
                site_name: site.name,
                error: wpError.message
            });
        }

    } catch (error) {
        console.error('[simulatePluginSync] Error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});