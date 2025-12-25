import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
        // Auth check
        const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
        const authHeader = req.headers.get('Authorization');
        const token = authHeader ? authHeader.replace('Bearer ', '') : null;
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (!user) {
            return new Response(
                JSON.stringify({ error: "unauthorized" }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            );
        }

        // Parse request
        const body = await req.json();
        const { site, plugin_slug, action, file_url, installation_id } = body;
        let result = { success: false, message: 'Unknown error' };

        switch (action) {
            case 'install':
                result = await installPlugin(site, plugin_slug, file_url, authHeader);
                break;
                switch (action) {
                    case 'install':
                        result = await installPlugin(site, plugin_slug, file_url, authHeader);
                        break;
                    case 'activate':
                        result = await activatePlugin(site, plugin_slug, authHeader);
                        break;
                    case 'deactivate':
                        result = await deactivatePlugin(site, plugin_slug, authHeader);
                        break;
                    case 'uninstall':
                        result = await uninstallPlugin(site, plugin_slug, authHeader);
                        break;
                    default:
                        return new Response(
                            JSON.stringify({ error: 'Invalid action' }),
                            { status: 400, headers: { "Content-Type": "application/json" } }
                        );
                }
                return new Response(
                    JSON.stringify(result),
                    { status: result.success ? 200 : 400, headers: { "Content-Type": "application/json" } }
                );
                result = await deactivatePlugin(site, plugin_slug, authHeader);
                break;
            case 'uninstall':
                result = await uninstallPlugin(site, plugin_slug, authHeader);
                break;
            default:
                return new Response(
                    JSON.stringify({ error: 'Invalid action' }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
        }

        return new Response(
            JSON.stringify(result),
            { status: result.success ? 200 : 400, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error('[executePluginAction] ❌ ERROR:', error.message);
        console.error('[executePluginAction] Stack:', error.stack);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});


async function installPlugin(site, plugin_slug, file_url, authHeader) {
    console.log('[installPlugin] Installing plugin:', plugin_slug);
    console.log('[installPlugin] File URL:', file_url);

    try {
        // First, download the ZIP file
        console.log('[installPlugin] Downloading ZIP file...');
        const zipResponse = await fetch(file_url);
        
        if (!zipResponse.ok) {
            throw new Error(`Failed to download plugin ZIP: ${zipResponse.statusText}`);
        }

        const zipBlob = await zipResponse.blob();
        console.log('[installPlugin] ZIP downloaded, size:', zipBlob.size, 'bytes');

        // Create form data with the ZIP file
        const formData = new FormData();
        formData.append('file', zipBlob, `${plugin_slug}.zip`);
        formData.append('status', 'inactive');

        const wpEndpoint = `${site.url}/wp-json/wp/v2/plugins`;
        console.log('[installPlugin] Uploading to WordPress:', wpEndpoint);
        
        const response = await fetch(wpEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
            },
            body: formData
        });

        const data = await response.json();
        console.log('[installPlugin] WordPress response:', JSON.stringify(data));
        
        if (!response.ok) {
            console.error('[installPlugin] Error response:', data);
            return {
                success: false,
                error: data.message || data.code || 'Installation failed',
                message: data.message || 'Installation failed'
            };
        }

        console.log('[installPlugin] ✅ Success');
        
        return {
            success: true,
            message: 'Plugin successfully installed',
            version: data.version
        };
    } catch (error) {
        console.error('[installPlugin] ❌ Error:', error.message);
        return {
            success: false,
            error: error.message,
            message: error.message
        };
    }
}

async function activatePlugin(site, plugin_slug, authHeader) {
    console.log('[activatePlugin] Activating plugin:', plugin_slug);

    try {
        // Need to find the full plugin path first
        const listResponse = await fetch(`${site.url}/wp-json/wp/v2/plugins`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });

        const plugins = await listResponse.json();
        console.log('[activatePlugin] Found', plugins.length, 'plugins on site');
        
        const plugin = plugins.find(p => p.plugin.split('/')[0] === plugin_slug);
        
        if (!plugin) {
            console.error('[activatePlugin] Plugin not found. Available plugins:', 
                plugins.map(p => p.plugin.split('/')[0]).join(', '));
            return {
                success: false,
                error: 'Plugin not found on site',
                message: 'Plugin not found on site'
            };
        }

        console.log('[activatePlugin] Found plugin:', plugin.plugin);

        // Now activate it
        const wpEndpoint = `${site.url}/wp-json/wp/v2/plugins/${encodeURIComponent(plugin.plugin)}`;
        
        const response = await fetch(wpEndpoint, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                status: 'active'
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('[activatePlugin] Error:', data);
            return {
                success: false,
                error: data.message || 'Activation failed',
                message: data.message || 'Activation failed'
            };
        }

        console.log('[activatePlugin] ✅ Success');
        
        return {
            success: true,
            message: 'Plugin successfully activated',
            version: data.version
        };
    } catch (error) {
        console.error('[activatePlugin] ❌ Error:', error.message);
        return {
            success: false,
            error: error.message,
            message: error.message
        };
    }
}

async function deactivatePlugin(site, plugin_slug, authHeader) {
    console.log('[deactivatePlugin] Deactivating plugin:', plugin_slug);

    try {
        // Need to find the full plugin path first
        const listResponse = await fetch(`${site.url}/wp-json/wp/v2/plugins`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });

        const plugins = await listResponse.json();
        const plugin = plugins.find(p => p.plugin.split('/')[0] === plugin_slug);
        
        if (!plugin) {
            return {
                success: false,
                error: 'Plugin not found on site',
                message: 'Plugin not found on site'
            };
        }

        // Now deactivate it
        const wpEndpoint = `${site.url}/wp-json/wp/v2/plugins/${encodeURIComponent(plugin.plugin)}`;
        
        const response = await fetch(wpEndpoint, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                status: 'inactive'
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('[deactivatePlugin] Error:', data);
            return {
                success: false,
                error: data.message || 'Deactivation failed',
                message: data.message || 'Deactivation failed'
            };
        }

        console.log('[deactivatePlugin] ✅ Success');
        
        return {
            success: true,
            message: 'Plugin successfully deactivated',
            version: data.version
        };
    } catch (error) {
        console.error('[deactivatePlugin] ❌ Error:', error.message);
        return {
            success: false,
            error: error.message,
            message: error.message
        };
    }
}

async function uninstallPlugin(site, plugin_slug, authHeader) {
    console.log('[uninstallPlugin] Uninstalling plugin:', plugin_slug);

    try {
        // Need to find the full plugin path first
        const listResponse = await fetch(`${site.url}/wp-json/wp/v2/plugins`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });

        const plugins = await listResponse.json();
        const plugin = plugins.find(p => p.plugin.split('/')[0] === plugin_slug);
        
        if (!plugin) {
            return {
                success: true,  // Already uninstalled
                message: 'Plugin already uninstalled'
            };
        }

        // First deactivate if active
        if (plugin.status === 'active') {
            await deactivatePlugin(site, plugin_slug, authHeader);
        }

        // Now delete it
        const wpEndpoint = `${site.url}/wp-json/wp/v2/plugins/${encodeURIComponent(plugin.plugin)}`;
        
        const response = await fetch(wpEndpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('[uninstallPlugin] Error:', data);
            return {
                success: false,
                error: data.message || 'Uninstall failed',
                message: data.message || 'Uninstall failed'
            };
        }

        console.log('[uninstallPlugin] ✅ Success');
        
        return {
            success: true,
            message: 'Plugin successfully uninstalled'
        };
    } catch (error) {
        console.error('[uninstallPlugin] ❌ Error:', error.message);
        return {
            success: false,
            error: error.message,
            message: error.message
        };
    }
}
