import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const cors = handleCors(req);
    if (cors) return cors;
    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);
        
        const body = await req.json().catch(() => ({}));
        const site_id = body.site_id;
        
        if (!site_id) {
            return new Response(JSON.stringify({ error: 'Missing site_id' }), { status: 400, headers: corsHeaders });
        }
        
        // Get site details
        const { data: site, error: siteError } = await supabase.from('sites').select('url, api_key').eq('id', site_id).single();
        if (siteError || !site) {
            return new Response(JSON.stringify({ error: 'Site not found' }), { status: 404, headers: corsHeaders });
        }
        
        const site_url = (site.url || '').replace(/\/$/, '');
        const api_key = site.api_key;
        
        if (!site_url || !api_key) {
            return new Response(JSON.stringify({ error: 'Site missing URL or API key' }), { status: 400, headers: corsHeaders });
        }
        
        // Get installed plugins to find the connector
        const pluginsUrl = `${site_url}/wp-json/wp/v2/plugins`;
        const pluginsRes = await fetch(pluginsUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${api_key}`
            }
        });
        
        let plugins: any[] = [];
        if (pluginsRes.ok) {
            const pluginsText = await pluginsRes.text();
            try {
                plugins = JSON.parse(pluginsText);
            } catch { }
        }
        
        // Find connector plugin
        const connectorPlugin = plugins.find((p: any) => 
            p.plugin && (p.plugin.includes('wp-plugin-hub-connector') || p.name?.includes('WP Plugin Hub Connector'))
        );
        
        if (!connectorPlugin) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Connector plugin not found on site',
                current_version: null,
                latest_version: null,
                update_available: false
            }), { status: 200, headers: corsHeaders });
        }
        
        // Get active connector version from settings
        const { data: settings, error: settingsError } = await supabase.from('site_settings').select('*').eq('setting_key', 'active_connector_version').single().catch(() => ({ data: null }));
        
        const activeVersion = settings?.setting_value || null;
        
        return new Response(JSON.stringify({
            success: true,
            current_version: connectorPlugin.version || 'unknown',
            latest_version: activeVersion,
            update_available: activeVersion && connectorPlugin.version !== activeVersion
        }), { status: 200, headers: corsHeaders });
    } catch (error) {
        const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Unknown error');
        console.error('[getConnectorVersion] ERROR:', message);
        return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: corsHeaders });
    }
});
