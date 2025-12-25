
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get('SB_URL')
    const ANON_KEY = Deno.env.get('SB_ANON_KEY')
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
    const { site_id } = await req.json()
    if (!site_id) {
      return Response.json({ error: 'Site ID is verplicht' }, { status: 400 })
    }
    // Get the site
    const { data: site, error: siteError } = await supabase.from('sites').select('*').eq('id', site_id).single()
    if (siteError || !site) {
      return Response.json({ error: 'Site niet gevonden' }, { status: 404 })
    }
    // Verify user is the site owner
    if (site.owner_type !== 'user' || site.owner_id !== user.id) {
      return Response.json({ error: 'Je bent niet gemachtigd om dit verzoek af te handelen' }, { status: 403 })
    }
    // Check if there's a pending transfer request
    if (!site.transfer_request || site.transfer_request.status !== 'pending') {
      return Response.json({ error: 'Geen openstaand overdrachtverzoek gevonden' }, { status: 400 })
    }
    const { requested_by_user_id, requested_by_user_email, requested_by_user_name } = site.transfer_request
    // Update site to remove transfer request
    const { error: updateError } = await supabase.from('sites').update({ transfer_request: { ...site.transfer_request, status: 'declined' } }).eq('id', site_id)
    if (updateError) {
      return Response.json({ error: 'Kon overdrachtverzoek niet bijwerken' }, { status: 500 })
    }
    // Send rejection message to requester (optional: implement messaging logic)
    // Send notification to requester (optional: implement notification logic)
    // Log activity (optional: implement activity log logic)
    return Response.json({ success: true, message: 'Overdrachtverzoek afgewezen' })
  } catch (error) {
    console.error('Decline site transfer error:', error)
    return Response.json({ error: error.message || 'Failed to decline site transfer' }, { status: 500 })
  }
})