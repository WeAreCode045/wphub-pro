import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  return new Response(
    JSON.stringify({ error: "unauthorized" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
});
        }

        await base44.asServiceRole.entities.Site.update(site_id, { connection_status: 'active', connection_checked_at: new Date().toISOString() });

        const allPlatformPlugins = await base44.asServiceRole.entities.Plugin.list();
        console.log('[listSitePlugins] Found', allPlatformPlugins.length, 'platform plugins');

        const wpPluginSlugs = result.plugins.map(p => p.slug);
        
        for (const platformPlugin of allPlatformPlugins) {
            const currentInstalledOn = platformPlugin.installed_on || [];
            let needsUpdate = false;
            let updatedInstalledOn = [...currentInstalledOn];

            const wpPlugin = result.plugins.find(p => p.slug === platformPlugin.slug);

            if (wpPlugin) {
                const existingEntry = updatedInstalledOn.find(entry => entry.site_id === site_id);
                
                if (!existingEntry) {
                    console.log('[listSitePlugins] Adding', platformPlugin.slug, 'to installed_on for site', site_id);
                    updatedInstalledOn.push({ site_id: site_id, version: wpPlugin.version });
                    needsUpdate = true;
                } else if (existingEntry.version !== wpPlugin.version) {
                    console.log('[listSitePlugins] Updating version for', platformPlugin.slug, 'on site', site_id, 'from', existingEntry.version, 'to', wpPlugin.version);
                    existingEntry.version = wpPlugin.version;
                    needsUpdate = true;
                }
            } else {
                const entryIndex = updatedInstalledOn.findIndex(entry => entry.site_id === site_id);
                if (entryIndex !== -1) {
                    console.log('[listSitePlugins] Removing', platformPlugin.slug, 'from installed_on for site', site_id);
                    updatedInstalledOn.splice(entryIndex, 1);
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                await base44.asServiceRole.entities.Plugin.update(platformPlugin.id, { installed_on: updatedInstalledOn });
                console.log('[listSitePlugins] ✅ Updated installed_on for plugin:', platformPlugin.slug);
            }
        }

        console.log('[listSitePlugins] Reconciliation complete');
        console.log('[listSitePlugins] === END ===');

        return Response.json({ success: true, plugins: result.plugins, total: result.plugins.length });

    } catch (error) {
        console.error('[listSitePlugins] ❌ ERROR:', error.message);
        console.error('[listSitePlugins] Stack:', error.stack);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});