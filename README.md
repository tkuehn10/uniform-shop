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

   Staff log in with a plain username rather than an email address. Set `VITE_LOGIN_EMAIL_DOMAIN` to any value you like (e.g. `your-shop.login.local`) -- it's never a real, deliverable email domain, just the suffix the app appends to whatever username someone types before authenticating with Supabase (which only understands emails). Falls back to `login.local` if left unset. Whatever value you pick here must match what you use when creating logins in the Supabase dashboard (step 5 below).

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

   There's no in-app sign-up (see `docs/screens-and-flows.md` section 4). Since staff log in with a username, not an email, create the Supabase Auth user with a synthetic email of `<username>@<your VITE_LOGIN_EMAIL_DOMAIN>` -- e.g. if you kept the example value above and want the username `tom`, use `tom@your-shop.login.local`. In the Supabase dashboard: Authentication → Users → Add user (with that synthetic email and a password), then run:

   ```sql
   insert into profiles (id, display_name, role)
   values ('<the-user-id-from-step-above>', 'Your Name', 'admin');
   ```

   Tell the person their username (`tom`, not the full synthetic email) and password -- that's all they type in on the login screen. Once signed in, they can change the password themselves at `/change-password`; the page isn't linked from the menu, so pass on the address.

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

Connect this repository to a Cloudflare Pages project (build command `npm run build`, output directory `dist`). Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SHOP_NAME`, and `VITE_LOGIN_EMAIL_DOMAIN` as build variables in the Pages project settings (see `docs/implementation-roadmap.md` Phase 1 step 5) — every push to `main` then deploys automatically.

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

All of Phase 3 is built: item management + bulk initial stock entry, stock overview + record-a-sale, supplier orders + delivery check-in, full/spot stocktake, sales reports + CSV export, and roster + opening-times + school holidays. See `docs/implementation-roadmap.md` Phase 4 for what's left before real use (a manual test pass, real staff logins, real initial stock entry, and real opening-times/holiday setup).
