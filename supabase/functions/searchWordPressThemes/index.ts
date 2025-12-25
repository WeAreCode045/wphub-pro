import { createClientFromRequest } from '../base44Shim.js';

type WPTheme = {
  name?: string;
  slug?: string;
  version?: string;
  description?: string;
  author?: {
    display_name?: string;
    user_nicename?: string;
    profile?: string;
  };
  screenshot_url?: string;
  preview_url?: string;
  homepage?: string;
  download_link?: string;
  active_installs?: number;
  rating?: number;
  num_ratings?: number;
  last_updated?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
    }

    const { search, page = 1, per_page = 20 } = await req.json();

    if (!search) {
      return Response.json({ success: false, error: 'Search query is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const apiUrl = `https://api.wordpress.org/themes/info/1.2/?action=query_themes&request[search]=${encodeURIComponent(search)}&request[page]=${page}&request[per_page]=${per_page}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return Response.json({ success: false, error: 'WordPress API error' }, { status: 500, headers: CORS_HEADERS });
    }

    const data = await response.json();

    const themes = ((data.themes as WPTheme[]) || []).map((theme: WPTheme) => ({
      name: theme.name,
      slug: theme.slug,
      version: theme.version,
      description: theme.description ? theme.description.replace(/<[^>]*>/g, '').substring(0, 200) : '',
      author: theme.author?.display_name || theme.author?.user_nicename || '',
      author_profile: theme.author?.profile || '',
      screenshot_url: theme.screenshot_url || '',
      preview_url: theme.preview_url || '',
      homepage: theme.homepage || `https://wordpress.org/themes/${theme.slug}/`,
      download_url: theme.download_link || `https://downloads.wordpress.org/theme/${theme.slug}.${theme.version}.zip`,
      active_installs: theme.active_installs || 0,
      rating: theme.rating || 0,
      num_ratings: theme.num_ratings || 0,
      last_updated: theme.last_updated || ''
    }));

    return Response.json({
      success: true,
      themes,
      info: {
        page: data.info?.page || page,
        pages: data.info?.pages || 1,
        results: data.info?.results || themes.length
      }
    });

  } catch (error) {
    console.error('Search WordPress themes error:', error);
    const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Failed to search themes');
    return Response.json({
      success: false,
      error: message
    });
  }
});
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
    }
    const { search, page = 1, per_page = 20 } = await req.json();
    if (!search) {
      return new Response(JSON.stringify({ success: false, error: 'Search query is required' }), { status: 400, headers: CORS_HEADERS });
    }
    const apiUrl = `https://api.wordpress.org/themes/info/1.2/?action=query_themes&request[search]=${encodeURIComponent(search)}&request[page]=${page}&request[per_page]=${per_page}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return new Response(JSON.stringify({ success: false, error: 'WordPress API error' }), { status: 500, headers: CORS_HEADERS });
    }
    const data = await response.json();
    const themes = ((data.themes as WPTheme[]) || []).map((theme: WPTheme) => ({
      name: theme.name,
      slug: theme.slug,
      version: theme.version,
      description: theme.description,
      author: theme.author,
      screenshot_url: theme.screenshot_url,
      preview_url: theme.preview_url,
      homepage: theme.homepage,
      download_link: theme.download_link,
      active_installs: theme.active_installs,
      rating: theme.rating,
      num_ratings: theme.num_ratings,
      last_updated: theme.last_updated
    }));
    return new Response(JSON.stringify({ success: true, info: data.info, themes }), { headers: CORS_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Failed to search themes');
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: CORS_HEADERS });
  }
});
