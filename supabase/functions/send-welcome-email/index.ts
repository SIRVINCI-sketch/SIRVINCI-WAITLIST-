import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmailRequest {
  full_name?: string;
  email: string;
  whatsapp_url?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { full_name, email, whatsapp_url }: EmailRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstName = full_name ? full_name.trim().split(" ")[0] : "Creator";
    const communityLink = whatsapp_url || "https://chat.whatsapp.com/DwUFjABTAPCA9BNmIS5SXc";

    const emailSubject = "You're on the list! Welcome to Sirvinci Academy 🎨";

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0A0A0A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F5F5; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background-color: #141414; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 36px 30px; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
    .logo-wrap { margin-bottom: 28px; }
    .title { font-size: 24px; font-weight: 700; line-height: 1.25; margin: 0 0 16px; color: #FFFFFF; }
    .body-text { font-size: 15px; line-height: 1.6; color: #A3A3A3; margin: 0 0 20px; }
    .highlight-box { background: rgba(47, 118, 255, 0.08); border-left: 3px solid #2F76FF; padding: 16px 20px; border-radius: 8px; margin: 24px 0; }
    .highlight-title { font-size: 14px; font-weight: 600; color: #FFFFFF; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .highlight-list { margin: 0; padding-left: 20px; color: #D4D4D4; font-size: 14px; line-height: 1.6; }
    .btn-whatsapp { display: inline-block; background-color: #25D366; color: #FFFFFF; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 50px; margin: 12px 0 24px; text-align: center; box-shadow: 0 4px 16px rgba(37, 211, 102, 0.3); }
    .btn-whatsapp:hover { background-color: #1EBE5D; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #737373; line-height: 1.5; }
    .footer a { color: #A3A3A3; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo-wrap">
        <img src="https://pnkxoktjhzjvjarediid.supabase.co/storage/v1/object/public/assets/sirvinci-academy-logo-official.png" alt="Sirvinci Academy" width="180" style="display: block; width: 180px; max-width: 100%; height: auto; border: 0;" />
      </div>
      <h1 class="title">You're officially on the waitlist, ${firstName}! 🎉</h1>
      <p class="body-text">
        Thank you for taking the leap. You have secured your founding spot for <strong>Sirvinci Academy</strong> — the self-paced masterclass built to teach professional visual design entirely from your smartphone.
      </p>
      
      <div class="highlight-box">
        <div class="highlight-title">What happens next:</div>
        <ul class="highlight-list">
          <li><strong>Founding Member Pricing:</strong> Locked-in lowest price before public launch</li>
          <li><strong>Curriculum Sneak Peeks:</strong> Real design breakdowns straight to your inbox</li>
          <li><strong>Early Access:</strong> First access to modules when beta doors open</li>
        </ul>
      </div>

      <p class="body-text">
        <strong>Take the next step right now:</strong> Join our private WhatsApp Community to connect with fellow creators, ask questions directly, and catch exclusive announcements:
      </p>

      <div style="text-align: center;">
        <a href="${communityLink}" class="btn-whatsapp" target="_blank" rel="noopener noreferrer">
          👉 Join the WhatsApp Community Now
        </a>
      </div>

      <p class="body-text" style="font-size: 13px; color: #737373; text-align: center; margin-top: 8px;">
        Direct link: <a href="${communityLink}" style="color: #2F76FF; word-break: break-all;">${communityLink}</a>
      </p>

      <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 28px 0 20px;">

      <p class="body-text" style="margin-bottom: 4px; color: #E5E5E5; font-weight: 500;">
        "Design isn't a talent you're born with. It's a skill taught step by step."
      </p>
      <p class="body-text" style="font-size: 13px; color: #737373; margin-top: 0;">
        — David Ogebe, Founder of Sirvinci Creative Studio
      </p>
    </div>

    <div class="footer">
      <p>© 2026 Sirvinci Creative Studio. All rights reserved.<br>
      Questions? Reach out to <a href="mailto:hello@sirvinci.design">hello@sirvinci.design</a></p>
    </div>
  </div>
</body>
</html>
    `;

    // Resend API key: loaded securely from Supabase secrets environment
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (resendApiKey) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Sirvinci Academy <onboarding@resend.dev>",
          to: [email],
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      const resendData = await resendRes.json();
      console.log("[Resend Delivery Response]", resendRes.status, resendData);

      return new Response(
        JSON.stringify({
          success: resendRes.ok,
          provider: "resend",
          data: resendData
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[Email Automation Error]:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
