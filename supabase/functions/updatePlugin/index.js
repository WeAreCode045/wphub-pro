import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  return new Response(
    JSON.stringify({ error: "unauthorized" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
});

        if (download_url) {
            payload.file_url = download_url;
        }

        const response = await fetch(connectorUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[updatePlugin] Connector error:', errorText);
            return Response.json({ success: false, error: `Connector error: ${response.status} - ${errorText}` }, { status: 500 });
        }

        const result = await response.json();
        console.log('[updatePlugin] Connector response:', result);

        if (result.success && plugin_id && result.version) {
            const plugins = await base44.entities.Plugin.filter({ id: plugin_id });
            if (plugins.length > 0) {
                const plugin = plugins[0];
                const currentInstalledOn = plugin.installed_on || [];
                const existingEntry = currentInstalledOn.find(entry => entry.site_id === site_id);
                
                if (existingEntry) {
                    existingEntry.version = result.version;
                    await base44.entities.Plugin.update(plugin_id, { installed_on: currentInstalledOn });
                    console.log('[updatePlugin] ✅ Updated version in installed_on to:', result.version);
                }
            }
        }

        console.log('[updatePlugin] === END ===');

        return Response.json({ success: result.success, message: result.message, version: result.version });

    } catch (error) {
        console.error('[updatePlugin] ❌ ERROR:', error.message);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});