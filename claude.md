# Project Constitution (`claude.md` / `gemini.md`)

## 1. System Invariants & Operating Rules
- **Law of Memory:** `gemini.md` / `claude.md` is Law. `task_plan.md`, `findings.md`, and `progress.md` are Memory.
- **Data-First Invariant:** No execution code or tools in `tools/` may be authored until the Input/Output JSON schema is defined and approved here.
- **3-Layer Separation:**
  1. Architecture (`architecture/`): Standard Operating Procedures (SOPs in Markdown).
  2. Navigation: Decision-making orchestration calling deterministic tools.
  3. Tools (`tools/`): Atomic, deterministic Python scripts.
- **Self-Annealing:** Every tool failure must follow: Analyze -> Patch -> Test -> Update Architecture SOP.
- **Local vs Deliverable:**
  - Intermediate files, scraper dumps, and raw logs belong in `.tmp/`.
  - Final deliverables belong in the designated cloud or user-facing destination.

---

## 2. Data Schemas (JSON Input / Output)
*(To be populated upon receipt of discovery answers)*

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PayloadSchema",
  "type": "object",
  "properties": {},
  "required": []
}
```

---

## 3. Behavioral Rules & Constraints
- Deterministic logic over probabilistic assumptions.
- Environment variables must be kept in `.env`.
- Any external API integration requires a verified link handshake before feature coding.

---

## 4. Maintenance & Run Log
- **Initialized:** Protocol 0 setup completed.
