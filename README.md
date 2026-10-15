# SIRVINCI ACADEMY — Waitlist Landing Page

> Mobile-first, high-impact dark mode waitlist landing page for **Sirvinci Academy** by **Sirvinci Creative Studio**.

---

## 🌟 Highlights
- **Design System**: Sleek Dark Mode (`#0A0A0A` base, `#141414` elevated surfaces) with electric royal brand blue (`#2F76FF`) accents.
- **Mobile-First Responsive Layout**: Optimized for 375px+ smartphones up to 4K desktop screens with native vector typography and zero raster blur.
- **Backend & Database**: Fully connected to **Supabase** (PostgreSQL) with Row Level Security (RLS) enabled. Captures full names, emails, design experience, goals, reasons, payment preferences, and expected pricing in real-time.
- **Tactile Micro-Interactions**: Ambient glowing orbs, smooth marquee ticker, animated FAQ accordion, interactive radio cards, and inline animated checkmark confirmation.

---

## 📂 Project Structure
```text
├── index.html        # Main semantic landing page
├── styles.css        # Vanilla CSS design tokens & layout
├── main.js           # Supabase REST client & form validator
├── assets/           # High-resolution logos, mockups, and instructor portrait
├── serve.ps1         # Native PowerShell local static web server (no dependencies required)
├── serve.js          # Node.js local web server
└── README.md         # Documentation
```

---

## 🚀 Running Locally
You can run the site immediately using PowerShell without needing to install Node or Python:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then visit **`http://localhost:3030/`** in your browser.

---

## 🌐 Canonical Production & Deployment URLs
The waitlist is the pre-launch interest and lead-capture page for Sirvinci Academy's self-paced, mobile-first Canva design masterclass planned for the 2027 cohort. It collects contact details and optional information about learner experience, goals, barriers, payment preference, and expected price so the team can estimate demand, understand the audience, and contact interested learners about launch/enrolment. Joining the list is not a paid enrolment or a guarantee of a place.\n\nThe official canonical public waitlist website is:
- **`https://waitlist.sirvinci.com/`**

Authorized Vercel deployment and preview aliases:
- https://sirvinciacademy-waitlist.vercel.app/
- https://sirvinci-waitlist.vercel.app/

The URL `https://sirvinci-academy.vercel.app/` is not an alias for either recorded Vercel project and returns `DEPLOYMENT_NOT_FOUND`.

## ☁️ Supabase Integration
The browser submits to the `send-welcome-email` Edge Function. The function uses service-role-only database RPCs for registration and resend requests; browser clients cannot insert directly into the waitlist table or read registration/job status.
- **Table**: `public.waitlist`
- **Fields Captured**:
  - `full_name` (Text, required)
  - `email` (Text, required)
  - `canva_experience` (Text)
  - `main_goal` (Text, optional)
  - `stopped_reason` (Text)
  - `payment_pref` (Text)
  - `expected_cost` (Text, optional)
  - `status` (Text, default: `pending`)

New registrations atomically create a private email outbox job through a database trigger. The Edge Function sends using the `RESEND_API_KEY` and `RESEND_FROM_EMAIL` secrets; the database outbox tracks accepted, retryable, blocked, failed, and uncertain outcomes. The scheduled worker runs every five minutes and only includes blocked jobs in recovery after Resend reports the configured sender domain as verified. Recovery requests are authenticated with `EMAIL_RECOVERY_SECRET`, mirrored in Supabase Vault for the scheduled job.

Students can explicitly request a confirmation resend from the saved-registration screen. Requests reuse an idempotency UUID and are limited per email to a 10-second cooldown, 3 requests per rolling minute, 10 per rolling hour, and 20 per rolling 24 hours. The endpoint also uses a generic acknowledgment that does not disclose whether an email address is registered. These per-email controls are complemented by database row locks and idempotent job handling; a trusted edge/IP-level abuse limit should be added at the gateway before the waitlist receives significant public traffic. Legacy registrations without outbox history are held as uncertain until the student requests recovery; no historical registrations are automatically resent.

Apply the migrations in `supabase/migrations/` to a linked Supabase project. Run isolated logic tests with `node --test tests/waitlist-flow.test.js`; run the rollback-only live schema/queue integration test with `npx supabase db query --linked --file tests/waitlist-recovery.integration.sql`.

The recovery outbox deliberately does not backfill existing registrations: their historic email-delivery status is unknown, and automatically resending to all of them could duplicate confirmations. A duplicate submission for a legacy registration without an outbox record is marked uncertain and is not automatically resent. Verify the Resend sender domain and perform a controlled external-recipient test before public launch.

---

## 📄 License & Copyright
© 2026 Sirvinci Creative Studio. All rights reserved.
