# Task Plan: Project Implementation Blueprint

## Phase 0: Initialization (Mandatory)
- [x] Create project memory files (`task_plan.md`, `findings.md`, `progress.md`)
- [x] Initialize Project Constitution (`claude.md` & `gemini.md`)
- [x] Establish directory structure (`architecture/`, `tools/`, `.tmp/`)
- [ ] Present Discovery Questions to User
- [ ] Await User answers & confirm Data Schema

---

## Phase 1: Sirvinci Academy Waitlist Landing Page
- [x] Brand identity updated: "Sirvinci Academy" by Sirvinci Creative Studio
- [x] Cropped standalone circular emblem logo icon for clean display
- [x] Complete switch to primary Brand Blue (#2F76FF) across all design tokens, CTAs, glowing orbs, and states
- [x] Aligned all text and centered the Final CTA section ("Design Is a Skill. Not a Talent." + button)
- [x] Supabase project created (`savinci-academy`) and `public.waitlist` schema provisioned with RLS
- [x] Integrated `main.js` with Supabase REST API & publishable key
- [x] Verified full browser flow and database row insertion

---

## Phase 2: L - Link (Connectivity)
- [ ] Set up `.env` for secrets/credentials
- [ ] Build minimal verification scripts in `tools/`
- [ ] Test API connections & handshakes
- [ ] Verify external service responses before logic execution

---

## Phase 3: A - Architect (The 3-Layer Build)
- [ ] **Layer 1: Architecture (`architecture/`)**
  - [ ] Draft Technical SOPs in Markdown (goals, inputs, tool logic, edge cases)
- [ ] **Layer 2: Navigation (Decision Making)**
  - [ ] Define execution routing and tool chaining logic
- [ ] **Layer 3: Tools (`tools/`)**
  - [ ] Write deterministic, atomic Python scripts
  - [ ] Ensure all intermediates stay in `.tmp/`
  - [ ] Run test executions and self-annealing repair loops if errors arise

---

## Phase 4: S - Stylize (Refinement & UI)
- [ ] Format outputs and payloads for production standards
- [ ] Build frontend/UI or presentation components if required
- [ ] Review with user and gather refinement feedback

---

## Phase 5: T - Trigger (Deployment)
- [ ] Prepare cloud/production deployment
- [ ] Configure automation triggers (webhooks, cron, listeners)
- [ ] Finalize Maintenance Log in `gemini.md` / `claude.md`
