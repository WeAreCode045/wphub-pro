
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
        const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY')
        const supabase = createClient(SUPABASE_URL, ANON_KEY)
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
        let user = null
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const { data } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
            user = data.user
        }
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const { site_id, plugin_slug, plugin_id } = await req.json()
        if (!site_id || !plugin_slug) {
            return Response.json({ success: false, error: 'Missing required parameters: site_id and plugin_slug are required' }, { status: 400 })
        }
        // Get the site
        const { data: site, error: siteError } = await supabase.from('sites').select('*').eq('id', site_id).single()
        if (siteError || !site) {
            return Response.json({ success: false, error: 'Site not found' }, { status: 404 })
        }
        const connectorUrl = `${site.url}/wp-json/wphub/v1/uninstallPlugin`
        const response = await fetch(connectorUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: site.api_key, plugin_slug }) })
        if (!response.ok) {
            const errorText = await response.text()
            return Response.json({ success: false, error: `Connector error: ${response.status} - ${errorText}` }, { status: 500 })
        }
        const result = await response.json()
        if (!result.success) {
            return Response.json({ success: false, error: result.message || 'Uninstall failed' })
        }
        if (plugin_id) {
            // Remove site from installed_on array in plugins table
            const { data: plugin } = await supabase.from('plugins').select('*').eq('id', plugin_id).single()
            if (plugin) {
                const currentInstalledOn = plugin.installed_on || []
                const updatedInstalledOn = currentInstalledOn.filter((entry: any) => entry.site_id !== site_id)
                await supabase.from('plugins').update({ installed_on: updatedInstalledOn }).eq('id', plugin_id)
            }
        }
        // Optionally: log activity (implement as needed)
        return Response.json({ success: true, message: result.message || 'Plugin successfully uninstalled' })
    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 })
    }
})