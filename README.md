# Uniform Shop Stock System

A stock inventory, ordering, stocktake, sales, and roster system for a small school uniform shop.

Planning docs (requirements, architecture decisions, database schema, screen specs, and the build roadmap) live in [`docs/`](./docs) — start with [`docs/implementation-roadmap.md`](./docs/implementation-roadmap.md) for the current status and next steps.

## Stack

- **Frontend:** Vite + React (TypeScript), built as an installable PWA
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth) — see [`docs/architecture-decision.md`](./docs/architecture-decision.md)
- **Hosting:** Cloudflare Pages (frontend), Supabase (backend) — both on free tiers
- **Infrastructure as code:** SQL migration files in [`supabase/migrations/`](./supabase/migrations), applied with the Supabase CLI — see [`docs/adr-002-iac-and-repo-structure.md`](./docs/adr-002-iac-and-repo-structure.md)

## First-time setup

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Set up environment variables**

   ```sh
   cp .env.example .env
   ```

   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project's dashboard: **Settings → API Keys**.

   Supabase is mid-rollout (through 2026) of renaming these keys — you may see either the legacy **"anon" / "anon public"** key or the newer **"Publishable key"** (starts with `sb_publishable_...`). Either one works as `VITE_SUPABASE_ANON_KEY`; use whichever your project shows. Never use the "service_role" / "secret" key here.

   Also set `VITE_SHOP_NAME` to the shop's actual name -- it's shown on the login screen and in the app's top nav bar. Not sensitive, just a display string; falls back to "Uniform Shop" if left unset.

3. **Link the Supabase CLI to your project** (one-off, per machine)

   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```

   Your project ref is the subdomain in your Supabase project URL (`https://<project-ref>.supabase.co`).

4. **Apply the database migrations**

   ```sh
   npx supabase db push
   ```

   This creates every table, enum, trigger, and Row-Level Security policy described in [`docs/database-schema.md`](./docs/database-schema.md). See the comments at the top of each file in `supabase/migrations/` for what each one does.

5. **Create your first Admin login manually**

   There's no in-app sign-up (see `docs/screens-and-flows.md` section 4). In the Supabase dashboard: Authentication → Users → Add user, then run:

   ```sql
   insert into profiles (id, display_name, role)
   values ('<the-user-id-from-step-above>', 'Your Name', 'admin');
   ```

6. **Run the dev server**

   ```sh
   npm run dev
   ```

## Available scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build for production (`dist/`)
- `npm run preview` — preview the production build locally
- `npm run lint` — run oxlint

## Deploying

Connect this repository to a Cloudflare Pages project (build command `npm run build`, output directory `dist`). Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SHOP_NAME` as build variables in the Pages project settings (see `docs/implementation-roadmap.md` Phase 1 step 5 for exactly where) — every push to `main` then deploys automatically.

The Supabase project's free tier pauses after 7 days with no activity — `.github/workflows/supabase-keep-alive.yml` pings it daily to prevent this. It needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` set as repository **variables** (Settings → Secrets and variables → Actions → Variables) before it will run successfully; see `docs/implementation-roadmap.md` Phase 1 step 6.

## Project structure

```
docs/                   Planning docs — requirements, ADRs, schema, screens, roadmap
supabase/
  migrations/           Versioned SQL migrations (the database's source of truth)
  smoke_test.sql        Local-only dev smoke test (not applied to the real project)
  config.toml           Supabase CLI config
src/
  auth/                 Auth context (session + role loading, sign in/out)
  components/           Shared layout, route guards, placeholders
  lib/                  Supabase client + hand-written DB types
  pages/                One file per screen (docs/screens-and-flows.md)
```

## Status

Item management, sales, orders, stocktake, reports, and roster screens are stubbed but not yet built — see Phase 3 of `docs/implementation-roadmap.md` for build order. The Stock screen (`src/pages/StockPage.tsx`) is wired up end-to-end (auth → RLS → Postgres → UI) as a working reference for building the rest.
