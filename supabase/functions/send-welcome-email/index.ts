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
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F3F4F6; padding: 28px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.07); border: 1px solid #E5E7EB;">
          <tr>
            <td style="padding: 36px 28px;">

              <!-- Sirvinci Academy Official Brand Blue Logo -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td>
                    <img src="https://pnkxoktjhzjvjarediid.supabase.co/storage/v1/object/public/assets/sirvinci-academy-logo-blue.png" alt="Sirvinci Academy" width="180" height="47" style="display: block; width: 180px; height: 47px; max-width: 100%; border: 0; outline: none; text-decoration: none;" />
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="font-size: 24px; font-weight: 800; line-height: 1.25; margin: 0 0 16px 0; color: #111111;">
                You're officially on the waitlist, ${firstName}! 🎉
              </h1>

              <!-- Intro Body -->
              <p style="font-size: 15px; line-height: 1.6; color: #4B5563; margin: 0 0 20px 0;">
                Thank you for taking the leap. You have secured your founding spot for <strong style="color: #111111;">Sirvinci Academy</strong> — the self-paced masterclass built to teach professional visual design entirely from your smartphone.
              </p>

              <!-- Highlight Perks Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #EEF4FF; border-left: 4px solid #2F76FF; border-radius: 12px; margin: 24px 0;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 12px; font-weight: 800; color: #1E3A8A; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
                      WHAT HAPPENS NEXT:
                    </div>
                    <ul style="margin: 0; padding-left: 20px; color: #2D3748; font-size: 14px; line-height: 1.6;">
                      <li style="margin-bottom: 4px;"><strong style="color: #1A202C;">Founding Member Pricing:</strong> Locked-in lowest price before public launch</li>
                      <li style="margin-bottom: 4px;"><strong style="color: #1A202C;">Curriculum Sneak Peeks:</strong> Real design breakdowns straight to your inbox</li>
                      <li><strong style="color: #1A202C;">Early Access:</strong> First access to modules when beta doors open</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Community Pitch -->
              <p style="font-size: 15px; line-height: 1.6; color: #4B5563; margin: 0 0 20px 0;">
                <strong style="color: #111111;">Take the next step right now:</strong> Join our private WhatsApp Community to connect with fellow creators, ask questions directly, and catch exclusive announcements:
              </p>

              <!-- WhatsApp Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${communityLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #25D366; color: #FFFFFF; font-weight: 700; font-size: 15px; text-decoration: none; padding: 15px 32px; border-radius: 50px; text-align: center; box-shadow: 0 4px 16px rgba(37, 211, 102, 0.35);">
                      👉 Join the WhatsApp Community Now
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="font-size: 13px; color: #6B7280; text-align: center; margin: 0 0 28px 0; word-break: break-all;">
                Direct link: <a href="${communityLink}" style="color: #2F76FF; text-decoration: underline;">${communityLink}</a>
              </p>

              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0 20px 0;" />

              <!-- Founder Quote -->
              <p style="font-size: 14px; font-style: italic; color: #4B5563; margin: 0 0 6px 0; line-height: 1.5;">
                "Design isn't a talent you're born with. It's a skill taught step by step."
              </p>
              <p style="font-size: 13px; color: #6B7280; margin: 0;">
                — David Ogebe, Founder of Sirvinci Creative Studio
              </p>

            </td>
          </tr>
        </table>

        <!-- Email Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 540px; margin-top: 20px;">
          <tr>
            <td align="center" style="font-size: 12px; color: #888888; line-height: 1.5;">
              <p style="margin: 0 0 6px 0;">© 2026 Sirvinci Creative Studio. All rights reserved.</p>
              <p style="margin: 0;">Questions? Reach out to <a href="mailto:hello@sirvinci.design" style="color: #666666; text-decoration: underline;">hello@sirvinci.design</a></p>
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
