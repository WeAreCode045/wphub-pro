import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
        // Create Supabase client from env
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SB_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_ANON_KEY') ?? ''
        );

        // Get user session from Authorization header (if present)
        const authHeader = req.headers.get('authorization');
        let user = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const { data } = await supabase.auth.getUser(token);
            user = data?.user ?? null;
        }

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized', code: 401, message: 'Invalid JWT' }), { status: 401, headers: CORS_HEADERS });
        }

        // Support both POST (JSON body) and GET (query params)
        let search;
        let page = 1;
        let per_page = 20;

        if (req.method === 'GET') {
            const url = new URL(req.url);
            search = url.searchParams.get('search') || undefined;
            page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
            per_page = parseInt(url.searchParams.get('per_page') || '20', 10) || 20;
        } else {
            const body = await req.json().catch(() => ({}));
            search = body.search;
            page = body.page || 1;
            per_page = body.per_page || 20;
        }

        if (!search) {
            return new Response(JSON.stringify({ error: 'Search query is required' }), { status: 400, headers: CORS_HEADERS });
        }

        const wpApiUrl = `https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]=${encodeURIComponent(search)}&request[page]=${page}&request[per_page]=${per_page}`;
        const response = await fetch(wpApiUrl);
        if (!response.ok) throw new Error(`WordPress API returned ${response.status}`);

        const data = await response.json();
        type WPPlugin = {
            name?: string;
            slug?: string;
            version?: string;
            short_description?: string;
            author?: string;
            download_link?: string;
            active_installs?: number;
            rating?: number;
            num_ratings?: number;
            last_updated?: string;
        };
        const plugins = (data.plugins as WPPlugin[] | undefined)?.map((plugin: WPPlugin) => ({
            name: plugin.name,
            slug: plugin.slug,
            version: plugin.version,
            description: plugin.short_description,
            author: plugin.author?.replace(/<[^>]*>/g, ''),
            download_url: plugin.download_link,
            active_installs: plugin.active_installs,
            rating: plugin.rating,
            num_ratings: plugin.num_ratings,
            last_updated: plugin.last_updated
        })) || [];

        return new Response(JSON.stringify({ success: true, info: data.info, plugins }), { headers: CORS_HEADERS });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS_HEADERS });
    }
});
