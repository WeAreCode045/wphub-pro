import { createClientFromRequest } from '../base44Shim.js';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

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


Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const { search, page = 1, per_page = 20 } = await req.json();

    if (!search) {
      return new Response(JSON.stringify({ success: false, error: 'Search query is required' }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const apiUrl = `https://api.wordpress.org/themes/info/1.2/?action=query_themes&request[search]=${encodeURIComponent(search)}&request[page]=${page}&request[per_page]=${per_page}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return new Response(JSON.stringify({ success: false, error: 'WordPress API error' }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
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

    return new Response(JSON.stringify({
      success: true,
      themes,
      info: {
        page: data.info?.page || page,
        pages: data.info?.pages || 1,
        results: data.info?.results || themes.length
      }
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });

  } catch (error) {
    console.error('Search WordPress themes error:', error);
    const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Failed to search themes');
    return new Response(JSON.stringify({
      success: false,
      error: message
    }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
