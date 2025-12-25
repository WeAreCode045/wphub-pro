import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
    try {
        // Require authentication
        const authHeader = req.headers.get("authorization") || "";
        const jwt = authHeader.replace(/^Bearer /i, "");
        if (!jwt) {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Supabase client (service role)
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // Parse request body
        const body = await req.json();
        const { user_id, code } = body;
        if (!user_id || !code) {
            return new Response(JSON.stringify({ error: "Missing required parameters" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Fetch user
        const { data: user, error: userError } = await supabase.from('User').select('*').eq('id', user_id).single();
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "User not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Check code expiration
        if (!user.two_fa_code_expires_at || new Date(user.two_fa_code_expires_at) < new Date()) {
            return new Response(JSON.stringify({ success: false, error: 'Code has expired. Please request a new code.' }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Check code match
        if (user.two_fa_code !== code) {
            await supabase.from('ActivityLog').insert([
                {
                    user_email: user.email,
                    action: '2FA verificatie mislukt - onjuiste code',
                    entity_type: "user",
                    entity_id: user.id
                }
            ]);
            return new Response(JSON.stringify({ success: false, error: 'Invalid code' }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Generate session ID
        const sessionId = crypto.randomUUID();

        // Update user
        await supabase.from('User').update({
            two_fa_verified_session: sessionId,
            two_fa_code: null,
            two_fa_code_expires_at: null
        }).eq('id', user.id);

        // Log activity
        await supabase.from('ActivityLog').insert([
            {
                user_email: user.email,
                action: '2FA verificatie succesvol',
                entity_type: "user",
                entity_id: user.id
            }
        ]);

        return new Response(
            JSON.stringify({ success: true, message: '2FA verification successful', session_id: sessionId }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        let errorMessage = "Failed to verify 2FA code";
        if (error && typeof error === "object" && "message" in error) {
            errorMessage = (error as { message?: string }).message || errorMessage;
        }
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});
