import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


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

  // Require authentication
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer /i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  // Supabase client (service role)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Parse request body
    const body = await req.json();
    const { subject, message, sender_id, recipient_id, recipient_type, team_id, context } = body;
    if (!subject || !message || !sender_id || !recipient_id || !recipient_type) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Fetch sender and recipient
    const { data: user, error: userError } = await supabase.from("User").select("*").eq("id", sender_id).single();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sender not found" }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }
    let recipient_email = null;
    if (recipient_type === "user") {
      const { data: recipient } = await supabase.from("User").select("email").eq("id", recipient_id).single();
      recipient_email = recipient?.email || null;
    }

    // Create the message
    const { data: createdMessage, error: messageError } = await supabase.from("Message").insert([
      {
        subject,
        message,
        sender_id: user.id,
        sender_email: user.email,
        sender_name: user.full_name,
        recipient_type,
        recipient_id,
        recipient_email,
        team_id,
        is_read: false,
        is_archived: false,
        priority: "normal",
        status: "open",
        category: "general",
        context: context || {},
      },
    ]).select().single();
    if (messageError || !createdMessage) {
      return new Response(JSON.stringify({ error: "Failed to send message" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    // Create activity log
    await supabase.from("ActivityLog").insert([
      {
        user_email: user.email,
        action: `Bericht verzonden: ${subject}`,
        entity_type: "user",
        entity_id: user.id,
        details: `Naar ${recipient_type}: ${recipient_email || recipient_id}`,
      },
    ]);

    return new Response(
      JSON.stringify({ success: true, message: "Bericht succesvol verzonden", message_id: createdMessage.id }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    let errorMessage = "Failed to send message";
    if (error && typeof error === "object" && "message" in error) {
      errorMessage = (error as { message?: string }).message || errorMessage;
    }
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});