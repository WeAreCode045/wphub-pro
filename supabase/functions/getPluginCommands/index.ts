import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
    const cors = handleCors(req);
    if (cors) return cors;
    try {
        const supabase = createClient(Deno.env.get('SB_URL'), Deno.env.get('SB_SERVICE_ROLE_KEY'));
        const { api_key } = await req.json();
        if (!api_key) {
            return Response.json({ error: 'API key is required' }, { status: 401, headers: corsHeaders });
        }
        // Find site by API key
        const { data: sites, error: siteError } = await supabase.from('sites').select('*').eq('api_key', api_key);
        if (siteError || !sites || sites.length === 0) {
            return Response.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders });
        }
        const site = sites[0];
        // Get all plugin installations for this site
        const { data: allInstallations, error: instError } = await supabase.from('plugin_installations').select('*').eq('site_id', site.id);
        if (instError || !allInstallations) {
            return Response.json({ error: 'Failed to fetch plugin installations' }, { status: 500, headers: corsHeaders });
        }
        // Get all plugins
        const { data: allPlugins, error: pluginsError } = await supabase.from('plugins').select('*');
        if (pluginsError || !allPlugins) {
            return Response.json({ error: 'Failed to fetch plugins' }, { status: 500, headers: corsHeaders });
        }
        // Get all versions
        const { data: allVersions, error: versionsError } = await supabase.from('plugin_versions').select('*');
        if (versionsError || !allVersions) {
            return Response.json({ error: 'Failed to fetch plugin versions' }, { status: 500, headers: corsHeaders });
        }
        const commands = [];
        for (const installation of allInstallations) {
            const plugin = allPlugins.find(p => p.id === installation.plugin_id);
            const version = allVersions.find(v => v.id === installation.version_id);
            if (!plugin || !version) {
                continue;
            }
            let action = null;
            // SCENARIO 1: Plugin moet gedeïnstalleerd worden (was geïnstalleerd maar is nu unavailable)
            if (!installation.is_enabled && installation.installed_version) {
                action = 'uninstall';
            }
            // SCENARIO 2: Status is pending en plugin is nog niet geïnstalleerd -> INSTALL
            else if (installation.status === 'pending' && !installation.installed_version) {
                action = 'install';
            }
            // SCENARIO 3: Status is pending en versie is veranderd -> UPDATE
            else if (installation.status === 'pending' && installation.installed_version && installation.installed_version !== version.version) {
                action = 'update';
            }
            // SCENARIO 4: Plugin is geïnstalleerd, moet geactiveerd worden
            else if (installation.status === 'pending' && installation.installed_version && installation.is_active === true) {
                action = 'activate';
            }
            // SCENARIO 5: Plugin is geïnstalleerd, moet gedeactiveerd worden
            else if (installation.status === 'pending' && installation.installed_version && installation.is_active === false) {
                action = 'deactivate';
            }
            if (action) {
                const command = {
                    installation_id: installation.id,
                    plugin_id: plugin.id,
                    plugin_slug: plugin.slug,
                    plugin_name: plugin.name,
                    action: action,
                    version: version.version,
                    file_url: version.file_url
                };
                commands.push(command);
            }
        }
        return Response.json({
            success: true,
            commands: commands,
            debug: {
                site_id: site.id,
                site_name: site.name,
                total_installations: allInstallations.length,
                total_commands: commands.length
            }
        }, { headers: corsHeaders });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
});