# CLAUDE.md

Guidance for Claude (or any AI assistant) working in this repository.

## What this is

A stock inventory, ordering, stocktake, sales-reporting, and roster system for a small
school uniform shop, run by volunteers. No payment processing — it tracks stock
movements only.

**Start here:** `docs/implementation-roadmap.md` is the single source of truth for what's
done and what's next. Read it before making changes.

## Planning docs (read before changing behavior, not just code)

All in `docs/`:

- `requirements.md` — functional requirements (`REQ-N`) and scope assumptions (`A-N`).
  Every feature should trace back to a REQ id.
- `architecture-decision.md` (ADR-001) — backend/hosting choice (Supabase + PWA) and its
  amendments (photos in Postgres, Cloudflare Pages over Vercel, Vite + React).
- `adr-002-iac-and-repo-structure.md` (ADR-002) — infrastructure-as-code approach: SQL
  migrations + git-native deploys, no Terraform.
- `database-schema.md` — the DDL, matching `supabase/migrations/`, plus the RLS approach.
- `screens-and-flows.md` — screen-by-screen spec, used as the Phase 3 build checklist.
- `implementation-roadmap.md` — the ordered checklist tying all of the above together.

If a change contradicts one of these docs, update the doc in the same change — don't let
them drift from the code.

## Key conventions

- **Schema changes only via migrations.** Never hand-edit the database in the Supabase
  dashboard. Add a new file under `supabase/migrations/`; the existing ones are the
  history, not to be edited after the fact.
- **Stock ledger pattern.** `stock_movements` is the source of truth for every stock
  change; `item_sizes.quantity_on_hand` is a cached column kept in sync by triggers. Don't
  write directly to `quantity_on_hand`.
- **RLS is the real enforcement layer**, not just a nice-to-have. Admin/User permission
  splits are enforced with Postgres Row-Level Security policies, not only in the frontend.
  Trigger functions that need to bypass RLS (e.g. to write a derived `stock_movements` row)
  are `SECURITY DEFINER` — keep that pattern rather than loosening the client-facing
  policies.
- **Item photos live in Postgres** (`item_photos`, `bytea`, compressed client-side to
  roughly 400px / ~100KB), not in Supabase Storage — a deliberate choice (ADR-001
  Amendment 1) to keep the number of cloud services small. Don't reintroduce Storage
  without raising it as an architecture change.
- **Requirement traceability.** New or changed functionality should reference the REQ id(s)
  it satisfies, in code comments and in `docs/requirements.md`'s change log.
- **One repo, lightweight IaC** (ADR-002): app code, migrations, and hosting config all
  live here. No Terraform. The one accepted manual step is creating the Supabase project
  itself.

## Git

**Never run `git commit`, `git push`, or any other commit/publish operation unless the
user explicitly asks for that specific action in that moment.** Editing, staging, or
even just checking status is fine; committing is not, until asked.

## Environment & secrets

- Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` (the bare project URL,
  e.g. `https://<ref>.supabase.co` — no path suffix) and `VITE_SUPABASE_ANON_KEY` (the
  "anon public" or newer "Publishable" key from Settings → API Keys).
- `VITE_SHOP_NAME` is a display-only string (the shop's name, shown on the login screen
  and the top nav bar via `src/lib/config.ts`) — not a credential, falls back to
  "Uniform Shop" if unset.
- `VITE_LOGIN_EMAIL_DOMAIN` lets staff log in with a plain username: Supabase Auth only
  understands emails, so each account is provisioned with a synthetic
  `<username>@VITE_LOGIN_EMAIL_DOMAIN` address, and the login screen appends this same
  domain before calling `signInWithPassword` (`src/pages/LoginPage.tsx`,
  `src/lib/config.ts`). Not a real domain and never emailed anywhere — falls back to
  `login.local` if unset.
- Never put the `service_role` / `secret` key in the frontend `.env` — it only ever goes
  into a GitHub Actions secret (used by the keep-alive ping).
- `.env` is gitignored; only `.env.example` (with placeholder values) is committed.

## Running locally

```sh
npm install
cp .env.example .env   # then fill in your Supabase project's values
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push   # applies supabase/migrations/
npm run dev
```

There's no in-app sign-up — see `docs/screens-and-flows.md` section 4 for provisioning
the first Admin login manually.

`supabase/smoke_test.sql` is a throwaway local-only script (run against a plain local
Postgres with a stubbed `auth` schema) that exercises the stock ledger, RLS policies, and
order-status triggers end-to-end. Not applied to the real project; safe to delete once
confidence is high, useful to extend when adding new triggers or policies.

## Current status

Phase 1 (repo, Supabase project, scaffold) and most of Phase 2 (migrations, triggers, RLS,
verified locally) are done. Remaining: connect Cloudflare Pages, push migrations to the
real Supabase project, provision the first real Admin login, then build out Phase 3's
screens in order. See `docs/implementation-roadmap.md` for the exact checklist.
