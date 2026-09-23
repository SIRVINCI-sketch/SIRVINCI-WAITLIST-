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

## ☁️ Supabase Integration
Form submissions post directly to the Supabase REST endpoint:
- **Table**: `public.waitlist`
- **Fields Captured**:
  - `full_name` (Text, required)
  - `email` (Text, required)
  - `canva_experience` (Text)
  - `main_goal` (Text, required)
  - `stopped_reason` (Text)
  - `payment_pref` (Text)
  - `expected_cost` (Text, required)
  - `user_agent` (Text)
  - `status` (Text, default: `pending`)

---

## 📄 License & Copyright
© 2026 Sirvinci Creative Studio. All rights reserved.
