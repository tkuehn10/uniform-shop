# ADR-002: Infrastructure as Code & Repository Structure

**Status:** Accepted (12 September 2026)
**Date:** 12 September 2026
**Deciders:** Shop management
**Repository:** https://github.com/tkuehn10/uniform-shop

## Context

Two related preferences were raised for how this project should be built and operated, on top of the backend/hosting choice in ADR-001:

- The whole project should be **infrastructure as code**, living in a **single GitHub repository** — no configuration that only exists by hand in a dashboard somewhere, where practical.
- Cloud services in use should stay **small in number and footprint** — the same preference behind ADR-001's amendment to drop Supabase Storage in favor of storing photos in Postgres.

These two preferences pull toward the same conclusion: whatever "infrastructure as code" means here shouldn't itself become a new, heavyweight piece of infrastructure to run and maintain.

## Decision

Adopt a **lightweight, native-tooling approach** to infrastructure as code, rather than a full Terraform-based stack:

- A single GitHub repository holds everything: the frontend app code, Supabase SQL migration files (`supabase/migrations/`), Supabase CLI configuration (`supabase/config.toml`), and the frontend host's config file (e.g. `wrangler.toml` for Cloudflare Pages).
- All database schema changes are made only through versioned SQL migration files, applied with the Supabase CLI (`supabase db push`) — the live database is never hand-edited directly.
- The frontend host is connected directly to the GitHub repository for automatic deploys on every push to `main` (and ideally preview deploys on pull requests) — no separate deploy step or tool.
- **One accepted manual exception:** creating the Supabase project itself (the account-level resource, its API keys) is a one-off action taken by hand in the Supabase dashboard, written down as a short setup runbook step rather than automated. Secrets (API keys, etc.) are stored in the hosting provider's environment-variable settings and in GitHub Actions secrets (for the keep-alive ping cron from ADR-001) — never committed to the repo.

## Options Considered

### Option A: Lightweight — SQL migrations + git-native deploys

| Dimension | Assessment |
|---|---|
| Complexity | Low — two purpose-built, well-documented free tools (Supabase CLI, the host's git integration), no new tool to learn |
| Cost | $0 — both are part of the already-free services from ADR-001 |
| Reproducibility | Everything that changes often (schema, code, config) is versioned in git; the Supabase project itself is a one-time manual step |
| Team familiarity | Low learning curve — mostly "write a migration file, push to git" |

**Pros:** Minimal tooling to learn and maintain; matches the "small cloud services" preference directly, since it adds no new service, just uses what ADR-001 already chose; every meaningful change is reviewable in git history.
**Cons:** Not "true" one-command full reproducibility — recreating the Supabase project from absolute zero takes a few manual dashboard steps, documented rather than scripted.

### Option B: Full Terraform (community Supabase + Cloudflare/Vercel providers)

| Dimension | Assessment |
|---|---|
| Complexity | Medium-High — a new tool, a state file to manage safely, provider version pinning |
| Cost | $0 in cloud billing, but real time cost to set up and maintain |
| Reproducibility | Highest — a single `terraform apply` can provision the entire stack, including the Supabase project itself |
| Team familiarity | Assumed low; steepest learning curve of the two options |

**Pros:** Strongest fit for "true" infrastructure as code — the entire stack, including the Supabase project itself, is declared in code and reproducible from scratch; valuable if multiple environments (e.g. staging + production) or disaster-recovery-from-nothing were real requirements.
**Cons:** Adds a new tool and an ongoing maintenance responsibility (state file, provider updates, drift) for a system that will only ever run as a single instance for a single small shop; the community Supabase Terraform provider covers less than the official CLI; runs directly against the "keep cloud services and tooling small" preference.

## Trade-off Analysis

Full Terraform's main benefit — disaster-recovery-grade reproducibility and clean multi-environment management — isn't something this project needs: there is one shop, one environment, and a small team without dedicated infrastructure capacity. Its cost (a new tool, a state file to look after, a steeper learning curve) is a poor trade for a benefit that isn't being used. The lightweight option still delivers what actually matters: every schema and config change lives in git and is reviewable, deploys happen automatically from a `git push`, and no one edits the live database or hosting config by hand.

## Consequences

- **Easier:** Onboarding a new contributor is close to "clone the repo, run the migrations"; every schema and configuration change has a git history and can be code-reviewed like any other change; there's no separate infrastructure pipeline or state file to keep healthy alongside the app itself.
- **Harder:** Recreating the whole system from absolute zero (e.g. moving to a brand-new Supabase account, or after losing access to the current one) requires following a short manual runbook rather than running one command.
- **To revisit:** If this system ever grows a second environment (e.g. a staging copy for testing changes) or is handed to a team that already runs Terraform elsewhere, Option B becomes more worth the overhead.

## Action Items

1. [x] Confirm this decision (Status → Accepted)
2. [x] Create the single GitHub repository as the source of truth for app code, migrations, and hosting config — https://github.com/tkuehn10/uniform-shop
3. [ ] Set up `supabase/migrations/` and treat "migration file, never a hand-edited change" as a hard rule for all schema changes
4. [ ] Connect the chosen frontend host directly to the repository for git-based auto-deploy
5. [ ] Write the one-off manual setup runbook step for creating the Supabase project and wiring its keys into the hosting provider's environment variables and GitHub Actions secrets

## Amendments

### Amendment 1 (12 September 2026): No `wrangler.toml` needed for Cloudflare Pages

The Decision section above anticipated a frontend host config file (e.g. `wrangler.toml`) living in the repo alongside the Supabase config. In practice, connecting a repo to Cloudflare Pages through its dashboard git integration (Workers & Pages → Create application → Pages → Connect to Git) configures the build command, output directory, and environment variables entirely through dashboard settings tied to the Pages project — no config file is created or required in the repo for this to work. This is actually a slightly better fit for this ADR's "no separate deploy step or tool" goal than a checked-in config file would have been. See `implementation-roadmap.md` Phase 1 steps 4–5 for the concrete setup steps.
