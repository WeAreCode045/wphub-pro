import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}


serve(async (req) => {
    const cors = handleCors(req);
    if (cors) return cors;
    // Require authentication
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer /i, "");
    if (!jwt) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Supabase client (service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        // Expect a file_url in the request body (URL to the plugin zip)
        const body = await req.json();
        const { file_url } = body;
        if (!file_url) {
            return new Response(JSON.stringify({ error: "Missing required parameter: file_url" }), { status: 400, headers: corsHeaders });
        }

        // Download the zip file
        const response = await fetch(file_url);
        if (!response.ok) {
            return new Response(JSON.stringify({ error: "Failed to download zip file" }), { status: 400, headers: corsHeaders });
        }
        const uint8Array = new Uint8Array(await response.arrayBuffer());

        // Parse ZIP
        const JSZip = (await import("https://cdn.skypack.dev/jszip@3.10.1")).default;
        const zip = await JSZip.loadAsync(uint8Array);

        // Helper function to decode string if needed
        const decodeString = (str: string) => {
            if (typeof str === "string" && /^[\d,]+$/.test(str)) {
                try {
                    return str.split(",").map(Number).map(char => String.fromCharCode(char)).join("");
                } catch (e) {
                    return str;
                }
            }
            return str;
        };

        // Get all file entries and decode them
        const rawEntries = Object.keys(zip.files);
        const fileMapping: Record<string, string> = {};
        rawEntries.forEach(rawKey => {
            const decodedName = decodeString(rawKey);
            fileMapping[decodedName] = rawKey;
        });
        const decodedEntries = Object.keys(fileMapping);

        if (decodedEntries.length === 0) {
            return jsonResponse({ success: false, error: "ZIP file is empty" }, 400);
        }

        // Find PHP files only in root or 1 level deep
        const phpFiles = decodedEntries.filter(entry => {
            if (!entry.endsWith(".php")) return false;
            if (entry.endsWith("/")) return false;
            const parts = entry.split("/").filter(p => p.length > 0);
            return parts.length === 1 || parts.length === 2;
        });

        if (phpFiles.length === 0) {
            return jsonResponse({ success: false, error: "No PHP files found in root or first-level directory of ZIP" }, 400);
        }

        // Search through PHP files for the one with "Plugin Name:" header
        let pluginFile = null;
        let pluginContent = null;
        for (const decodedFilename of phpFiles) {
            try {
                const rawKey = fileMapping[decodedFilename];
                if (!rawKey) continue;
                const zipEntry = zip.files[rawKey];
                if (!zipEntry || zipEntry.dir) continue;
                const uint8Content = await zipEntry.async("uint8array");
                const decoder = new TextDecoder("utf-8");
                let content = decoder.decode(uint8Content);
                const pluginNameMatch = content.match(/Plugin\s+Name:\s*(.+)/i);
                if (pluginNameMatch) {
                    pluginFile = decodedFilename;
                    pluginContent = content;
                    break;
                }
            } catch (error) {}
        }

        if (!pluginFile || !pluginContent) {
            return jsonResponse({ success: false, error: 'Could not find WordPress plugin file with "Plugin Name:" header in root or first-level directory. Make sure your ZIP contains a valid WordPress plugin.' }, 400);
        }

        // Extract slug from the path
        const pathParts = pluginFile.split("/").filter(p => p.length > 0);
        let slug = "";
        if (pathParts.length === 1) {
            slug = pathParts[0].replace(".php", "");
        } else {
            slug = pathParts[0];
        }

        // Parse plugin headers
        const header: Record<string, string> = { slug, download_url: file_url };
        const patterns: Record<string, RegExp> = {
            name: /Plugin\s+Name:\s*(.+)/i,
            version: /Version:\s*(.+)/i,
            description: /Description:\s*(.+)/i,
            author: /Author:\s*(.+)/i,
            author_url: /Author\s+URI:\s*(.+)/i,
        };
        for (const [key, regex] of Object.entries(patterns)) {
            const match = pluginContent.match(regex);
            if (match) {
                header[key] = match[1].trim();
            }
        }

        return jsonResponse({ success: true, plugin: header });
    } catch (error: any) {
        return jsonResponse({ success: false, error: error.message || String(error) }, 500);
    }
});