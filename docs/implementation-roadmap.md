# Implementation Roadmap — Uniform Shop Stock System

**Version:** 0.8
**Date:** 12 September 2026
**Repository:** https://github.com/tkuehn10/uniform-shop

A single ordered checklist pulling together the decisions and action items scattered across `architecture-decision.md` (ADR-001), `adr-002-iac-and-repo-structure.md`, `database-schema.md`, and `screens-and-flows.md`. Work top to bottom; later phases assume earlier ones are done.

## Phase 0 — Decisions

- [x] **ADR-001 accepted:** backend = Supabase (Postgres + Auth), frontend = a PWA
- [x] **Frontend framework decided:** Vite + React (ADR-001 Amendment 4)
- [x] **Frontend host decided:** Cloudflare Pages, not Vercel — Vercel's free Hobby plan is restricted to non-commercial use by its terms, which a uniform shop doesn't qualify for (ADR-001 Amendment 3)
- [x] **Schema open questions resolved:** order numbers unique per supplier, CSV export is client-side, no roster/holiday audit trail (`database-schema.md` section 5)
- [x] **ADR-002 accepted:** lightweight IaC — SQL migrations + git-native deploys, no Terraform

## Phase 1 — Repository & infrastructure setup

1. [x] Create the single GitHub repository — https://github.com/tkuehn10/uniform-shop
2. [x] Create the Supabase project by hand (the one accepted manual step in ADR-002). While setting it up:
   - **Skip "Connect with GitHub to sync branches."** That's Supabase's hosted Branching feature, which requires the paid Pro plan and bills separately per branch — it's not part of, or needed for, the lightweight IaC approach in ADR-002 (plain SQL migration files via the Supabase CLI, applied by us, not Supabase's hosted branch sync).
   - Pick the region closest to the shop (e.g. Sydney / `ap-southeast-2`) — this can't be changed later without creating a new project and migrating.
   - Confirm the **Free** plan is selected (no card required).
   - Save the database password shown at creation time somewhere safe — needed later to link the CLI (`supabase link`).
   - Once created, go to Authentication → Settings and turn **off** "Allow new users to sign up." There's no self-signup in this app (screens-and-flows.md section 4) — every login is created by hand — so this closes off the Auth API as a public registration path.
   - Note the project URL and `anon` public key (Project Settings → API) for wiring into Cloudflare Pages later (step 5). The `service_role` key, if ever needed, stays out of the frontend entirely and only ever goes into a GitHub Actions secret.
   - Install the Supabase CLI locally, `supabase login`, then `supabase init` and `supabase link --project-ref <ref>` inside the repo to connect it to this project — this is the actual "sync with the repo" step for our approach, done through the CLI rather than Supabase's paid GitHub integration.
3. [x] Scaffold the Vite + React app in the repo; add PWA support (`vite-plugin-pwa`, manifest, placeholder icons) — delivered as `uniform-shop-scaffold.zip`, ready to unzip into the repo and push
4. [x] Connect the repository to Cloudflare Pages for automatic deploy on every push to `main`:
   - Sign in at dash.cloudflare.com (free account, no card required) and go to **Workers & Pages** in the left sidebar.
   - **Create application → Pages → Connect to Git**, authorize the Cloudflare GitHub app, and when prompted, grant it access to just the `uniform-shop` repository rather than all repositories.
   - Select the `uniform-shop` repository and set `main` as the production branch.
   - Framework preset: choose **React (Vite)** if it's offered, or set these manually:
     - **Build command:** `npm run build`
     - **Build output directory:** `dist`
     - **Root directory:** leave blank — the app lives at the repo root
   - No `wrangler.toml` or CLI install is needed for this step — Pages' git integration builds and deploys entirely from these dashboard settings, matching ADR-002's "no separate deploy step or tool" (see ADR-002 Amendment 1).
   - Every push to `main` triggers a production deploy automatically; pull requests automatically get their own preview-deployment URL too.
   - The project gets a free `<project-name>.pages.dev` URL immediately after the first deploy; a custom domain can be added later under Settings → Custom domains if wanted.
5. [x] Add the Supabase URL and anon/publishable key as **build-time** variables in the Cloudflare project settings:
   - Cloudflare's current dashboard splits this into two separate sections that look similar but aren't: **Settings → Variables & Secrets** (runtime — only usable by actual Worker/Functions code) and **Settings → Build → Build variables and secrets** (build-time — used while `npm run build` runs). This project is static-assets-only (no server-side Worker code), so the runtime section will refuse with "Variables cannot be added to a Worker that only has static assets" — that's expected; use the **Build** section instead.
   - In **Settings → Build → Build variables and secrets**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for both the **Production** and **Preview** environments (same values for both — there's only one Supabase project).
   - Add both as the plaintext **Variable** type, not **Secret**. Cloudflare exposes both types at build time equally, but the anon/publishable key is designed to be public and ends up readable in the deployed JS bundle regardless — marking it Secret only makes it write-only in the dashboard (you can't view it again later) without hiding anything real. Reserve Secret for values that must never appear in the shipped frontend, like the `service_role` key (which doesn't go here at all — see step 2).
   - `VITE_SUPABASE_URL` must be the bare project URL, `https://<project-ref>.supabase.co` — no path suffix like `/rest/v1/`; the Supabase client library appends that itself.
   - Adding or changing build variables doesn't redeploy the site automatically — trigger a new deploy afterwards (push a commit, or use **Deployments → Retry deployment**).
6. [x] Set up the scheduled keep-alive ping (a GitHub Actions cron job hitting the Supabase project once a day) to prevent the free-tier pause after 7 days idle:
   - Workflow file added: `.github/workflows/supabase-keep-alive.yml`. It runs daily (and can be triggered manually from the Actions tab via "Run workflow" to test it), making a plain REST read against the `items` table using the anon/publishable key.
   - RLS restricts every table to the `authenticated` role, so this read always comes back as an empty array — that's fine, the request still reaches Postgres, which is what resets Supabase's inactivity clock.
   - **One-off setup needed for this to actually run:** add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository **variables** (not secrets — same public anon/publishable key already in Cloudflare Pages) under the GitHub repo's **Settings → Secrets and variables → Actions → Variables** tab.
   - After adding them, do a manual "Run workflow" once from the Actions tab to confirm it succeeds (HTTP 200) before leaving it to the daily schedule.

## Phase 2 — Database

7. [x] Set up `supabase/migrations/`; wrote the first migration from `database-schema.md`'s DDL (all 16 tables, enums, indexes) — `supabase/migrations/20260912000000_initial_schema.sql`
8. [x] Added the triggers that keep `item_sizes.quantity_on_hand` in sync with `stock_movements`, auto-create a `stock_movements` row from `delivery_lines`/`sale_lines`/`stocktake_counts` inserts, and auto-advance order status on delivery — all in the same migration. **Verified against a local Postgres instance**: stock ledger math, order status transitions, and stocktake reconciliation all behave as specified.
9. [x] Wrote and verified the Row-Level Security policies for the Admin/User split (`database-schema.md` section 4) — `supabase/migrations/20260912000001_rls_policies.sql`. Confirmed locally that a User role is correctly blocked from managing items/orders/roster patterns and from inserting manual stock adjustments, while both roles can record sales and claim/un-claim roster slots.
10. [x] Push the migrations to the real Supabase project (`npx supabase db push`, after linking) and provision the first Admin login manually (`screens-and-flows.md` section 4) so there's a way to log in and test everything that follows

## Phase 3 — Core build order

Roughly the order a real shop would start using the system, so each piece is testable as it lands:

11. [ ] Item management + bulk initial stock entry (screens 2.3, 2.4, 2.4a) — lets Admin set up the catalog and enter the shop's actual starting stock
12. [ ] Stock overview + record-a-sale (screens 2.2, 2.5) — the daily-use core for both roles
13. [ ] Supplier orders + delivery check-in (screens 2.6–2.10)
14. [ ] Stocktake, full and spot (screens 2.11–2.13)
15. [ ] Sales reports + CSV export (screen 2.14)
16. [ ] Roster + school holidays (screens 2.15–2.17)

## Phase 4 — Before real use

17. [ ] Manual test pass against the full REQ list in `requirements.md`
18. [ ] Provision real staff logins (Admin + User accounts as needed)
19. [ ] Do the real bulk initial stock entry with the shop's actual current inventory
20. [ ] Set up the recurring opening-times pattern and any known school holiday periods for the term ahead

## Change log

- **v0.8:** Phase 1 and Phase 2 complete: the keep-alive workflow is confirmed running (repo variables added, manual run succeeded), and the migrations are pushed to the real Supabase project with the first Admin login provisioned. Next up is Phase 3 — the core screens, starting with item management and bulk initial stock entry.
- **v0.7:** Checked off Phase 1 steps 4-5 (Cloudflare Pages connected and build variables set, confirmed working end-to-end). Added the keep-alive GitHub Actions workflow (`.github/workflows/supabase-keep-alive.yml`) for step 6, plus the one-off repo-variable setup it needs.
- **v0.6:** Corrected step 5: Cloudflare's current dashboard requires build-time variables to be set under Settings → Build → Build variables and secrets, not the runtime Settings → Variables & Secrets section (which now refuses on a static-assets-only project with "Variables cannot be added to a Worker that only has static assets").
- **v0.5:** Expanded Phase 1 steps 4 and 5 with concrete Cloudflare Pages setup instructions: connecting the repo via the dashboard's git integration (no wrangler.toml or CLI needed), the Vite build settings, and adding the Supabase URL/key as environment variables for both Production and Preview. Cross-referenced from a new ADR-002 amendment.
- **v0.4:** Delivered the app scaffold and database migrations as code — `uniform-shop-scaffold.zip` (Vite + React PWA, auth context, role-gated routing, a working Stock screen) and two SQL migrations (schema + triggers, RLS policies), both verified against a local Postgres instance before delivery. Remaining Phase 1/2 items are pushing to the real Supabase project and Cloudflare Pages setup.
- **v0.3:** Expanded the Supabase project creation step with concrete setup guidance: skip the paid GitHub branch-sync integration, pick a nearby region (locked in permanently), confirm the Free plan, save the DB password, disable public sign-ups, note down the API keys, and link the CLI to the project.
- **v0.2:** Marked repo creation and both ADRs as accepted; added the repository URL.
- **v0.1:** Initial roadmap.
