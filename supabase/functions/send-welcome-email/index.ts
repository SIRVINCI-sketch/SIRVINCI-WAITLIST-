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
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${emailSubject}</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0; padding: 0; background-color: #0A0A0A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #0A0A0A !important; }
      .email-card { background-color: #141414 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; background-image: linear-gradient(#0A0A0A, #0A0A0A); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0A0A0A; background-image: linear-gradient(#0A0A0A, #0A0A0A); padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #141414; background-image: linear-gradient(#141414, #141414); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.5);">
          <tr>
            <td style="padding: 36px 32px;">

              <!-- Sirvinci Academy Resilient Logo (Guaranteed High Contrast in Light & Dark Mode) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 28px 0;">
                <tr>
                  <td>
                    <img src="https://pnkxoktjhzjvjarediid.supabase.co/storage/v1/object/public/assets/sirvinci-academy-email-logo.png" alt="Sirvinci Academy" width="170" height="51" style="display: block; width: 170px; height: 51px; max-width: 100%; border: 0; outline: none; text-decoration: none;" />
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="font-size: 24px; font-weight: 700; line-height: 1.25; margin: 0 0 16px 0; color: #FFFFFF;">
                You're officially on the waitlist, ${firstName}! 🎉
              </h1>

              <!-- Intro Body -->
              <p style="font-size: 15px; line-height: 1.6; color: #D4D4D4; margin: 0 0 20px 0;">
                Thank you for taking the leap. You have secured your founding spot for <strong style="color: #FFFFFF;">Sirvinci Academy</strong> — the self-paced masterclass built to teach professional visual design entirely from your smartphone.
              </p>

              <!-- Highlight Perks Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #181F2E; background-image: linear-gradient(#181F2E, #181F2E); border-left: 4px solid #2F76FF; border-radius: 8px; margin: 24px 0;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 13px; font-weight: 700; color: #FFFFFF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
                      What happens next:
                    </div>
                    <ul style="margin: 0; padding-left: 20px; color: #E5E5E5; font-size: 14px; line-height: 1.6;">
                      <li style="margin-bottom: 4px;"><strong style="color: #FFFFFF;">Founding Member Pricing:</strong> Locked-in lowest price before public launch</li>
                      <li style="margin-bottom: 4px;"><strong style="color: #FFFFFF;">Curriculum Sneak Peeks:</strong> Real design breakdowns straight to your inbox</li>
                      <li><strong style="color: #FFFFFF;">Early Access:</strong> First access to modules when beta doors open</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Community Pitch -->
              <p style="font-size: 15px; line-height: 1.6; color: #D4D4D4; margin: 0 0 20px 0;">
                <strong style="color: #FFFFFF;">Take the next step right now:</strong> Join our private WhatsApp Community to connect with fellow creators, ask questions directly, and catch exclusive announcements:
              </p>

              <!-- WhatsApp Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${communityLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #25D366; color: #FFFFFF; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 50px; text-align: center; box-shadow: 0 4px 16px rgba(37, 211, 102, 0.35);">
                      👉 Join the WhatsApp Community Now
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="font-size: 13px; color: #888888; text-align: center; margin: 0 0 28px 0; word-break: break-all;">
                Direct link: <a href="${communityLink}" style="color: #2F76FF; text-decoration: underline;">${communityLink}</a>
              </p>

              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 28px 0 20px 0;" />

              <!-- Founder Quote -->
              <p style="font-size: 14px; font-style: italic; color: #F0F0F0; margin: 0 0 6px 0; line-height: 1.5;">
                "Design isn't a talent you're born with. It's a skill taught step by step."
              </p>
              <p style="font-size: 13px; color: #888888; margin: 0;">
                — David Ogebe, Founder of Sirvinci Creative Studio
              </p>

            </td>
          </tr>
        </table>

        <!-- Email Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; margin-top: 24px;">
          <tr>
            <td align="center" style="font-size: 12px; color: #777777; line-height: 1.5;">
              <p style="margin: 0 0 6px 0;">© 2026 Sirvinci Creative Studio. All rights reserved.</p>
              <p style="margin: 0;">Questions? Reach out to <a href="mailto:hello@sirvinci.design" style="color: #999999; text-decoration: underline;">hello@sirvinci.design</a></p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
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
