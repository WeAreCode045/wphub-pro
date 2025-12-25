import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    // Require authentication
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer /i, "");
    if (!jwt) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Supabase client (service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        const { site_id } = await req.json();
        if (!site_id) {
            return new Response(JSON.stringify({ error: "Missing required parameter: site_id" }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        // Fetch site data from Supabase
        const { data: site, error: siteError } = await supabase
            .from("Site")
            .select("*")
            .eq("id", site_id)
            .single();
        if (siteError || !site) {
            return new Response(JSON.stringify({ error: "Site not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        const healthData: any = { status: "unknown" };
        const startTime = Date.now();
        try {
            // Perform health check (simulate external API call)
            const response = await fetch(site.api_url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ api_key: site.api_key }),
            });
            const responseTime = Date.now() - startTime;

            if (!response.ok) {
                healthData.status = "critical";
                healthData.uptime = {
                    is_up: false,
                    response_time: responseTime,
                    last_down: new Date().toISOString(),
                };
            } else {
                const result = await response.json();
                // Uptime check
                healthData.uptime = {
                    is_up: true,
                    response_time: responseTime,
                    uptime_percentage: 99.9,
                };
                // Performance check
                healthData.performance = {
                    page_load_time: responseTime,
                    ttfb: result.ttfb || responseTime,
                    score:
                        responseTime < 500
                            ? "excellent"
                            : responseTime < 1000
                            ? "good"
                            : responseTime < 2000
                            ? "fair"
                            : "poor",
                    recommendations: [],
                };
                if (responseTime > 1000) {
                    healthData.performance.recommendations.push(
                        "Consider optimizing your WordPress site for better performance"
                    );
                }
                if (result.plugins_count > 30) {
                    healthData.performance.recommendations.push(
                        "You have many plugins installed. Consider deactivating unused ones."
                    );
                }
                // Security check
                const sslValid = site.url.startsWith("https://");
                healthData.security = {
                    ssl_valid: sslValid,
                    vulnerabilities: [],
                    last_scan: new Date().toISOString(),
                };
                if (!sslValid) {
                    healthData.security.vulnerabilities.push({
                        type: "ssl",
                        severity: "high",
                        description: "Site is not using HTTPS/SSL encryption",
                        affected_plugin: null,
                    });
                }
                // Updates check
                healthData.updates = {
                    core: {
                        current_version: result.wp_version,
                        latest_version: result.wp_latest_version || result.wp_version,
                        update_available: result.wp_update_available || false,
                    },
                    plugins: result.plugin_updates || [],
                    themes: result.theme_updates || [],
                    last_checked: new Date().toISOString(),
                };
                // Debug settings
                healthData.debug_settings = {
                    wp_debug: result.wp_debug || false,
                    wp_debug_log: result.wp_debug_log || false,
                    wp_debug_display: result.wp_debug_display || false,
                };
                // Determine overall status
                const hasVulnerabilities = healthData.security.vulnerabilities.length > 0;
                const hasCriticalUpdates = healthData.updates.core.update_available;
                const poorPerformance = healthData.performance.score === "poor";
                if (hasVulnerabilities || hasCriticalUpdates) {
                    healthData.status = "critical";
                } else if (poorPerformance || healthData.updates.plugins.length > 5) {
                    healthData.status = "warning";
                } else {
                    healthData.status = "healthy";
                }
            }
        } catch (fetchError) {
            healthData.status = "critical";
            healthData.uptime = {
                is_up: false,
                response_time: Date.now() - startTime,
                last_down: new Date().toISOString(),
            };
        }

        // Update site with health check data
        await supabase.from("Site").update({ health_check: healthData }).eq("id", site_id);

        // Optionally, create a notification if status is critical or warning
        if ((healthData.status === "critical" || healthData.status === "warning") && site.health_alerts_enabled !== false) {
            await supabase.from("Notification").insert([
                {
                    recipient_id: site.owner_id,
                    title: `Health Alert: ${site.name}`,
                    message: `Health check detected issues on ${site.name}. Status: ${healthData.status}`,
                    type: healthData.status === "critical" ? "error" : "warning",
                    context: {
                        type: "site",
                        id: site.id,
                        name: site.name,
                    },
                },
            ]);
        }

        return new Response(
            JSON.stringify({ success: true, health_check: healthData }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }
});