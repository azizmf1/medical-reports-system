# Assumptions

Marked `// ASSUMPTION:` in code where relevant. Where the spec was silent, the simplest
implementation consistent with the stated business rules was chosen.

1. **Repo location** — the spec asks for a repo-root monorepo (`/server`, `/client`). This
   repository already contains an existing application at its root, so the system lives in the
   self-contained `medical-reports-system/` directory with the same internal layout.
2. **bcrypt** — `bcryptjs` (pure-JS implementation of the bcrypt algorithm) is used instead of
   the native `bcrypt` binding to avoid native build issues; the hashing algorithm is bcrypt.
3. **PDF engine** — Playwright print-to-PDF of an HTML template (spec allows it) because it
   renders Arabic RTL correctly with no font shaping work. Requires
   `npx playwright install chromium` once. If Chromium is unavailable, approval still succeeds:
   a printable HTML fallback is stored and the PDF endpoint regenerates idempotently later.
4. **Seed Pull credentials** — the spec asks for generated credentials printed to SEED.md; the
   seed uses fixed, documented dev credentials (`ent_moh_pull_demo` / `pull-demo-secret-12345`)
   so SEED.md can be a committed document. Operations can regenerate real random credentials at
   any time (old ones revoked, secret shown once).
5. **Expired sample report** — spec §6 lists 6 sample reports; a 7th (approved 100 days ago with
   90-day validity) is seeded so "expired shows Expired in the Inquiry API" (DoD §3) is
   demonstrable out of the box.
6. **Checker read access** — checkers can open any report within their scope (queue shows only
   Submitted/Under Review). Data Entry users see only reports they created, in line with
   "My Reports" + BR-R4.
7. **Draft saves** — mandatory-field validation is enforced at submission; drafts may be saved
   partially filled (type/range/regex rules still validated on save). Examinee identity fields
   are always required, since duplicate prevention keys on them at creation time.
8. **Validity/expiry** — `expiry_date = approval_date + N days` is computed from the settings of
   the latest Published version at approval time. Already-approved reports keep their stored
   expiry when settings later change (the spec's live-settings exception names sharing behaviour;
   recomputing past expiry dates retroactively would alter issued certificates).
9. **Cancelled reports in the Inquiry API** — returned with `validity_status: "Cancelled"`
   (rather than 404), since the spec requires the API to expose the Cancelled status.
10. **Report numbers** — sequence resets each year (`RPT-{YYYY}-{6-digit}`), stored in a
    dedicated `report_number_seq` table.
11. **Under-review visibility** — while a report is Under Review, other checkers see it
    read-only with "Under review by {name}"; the claiming checker may also release it back to
    the queue without a decision (spec's unclaim action).
12. **File uploads** — stored under `/server/uploads` with random-prefixed names; the report data
    stores the file URL. Max 10 MB per file.
13. **Simulator page access** — the simulator inbox is part of the Operations sidebar (Operations
    monitors sharing); the webhook endpoint itself is public so any local entity URL works.
14. **Session lifetime** — JWT access tokens expire after 12h; no refresh tokens (out of scope).
