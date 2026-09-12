# ADR-001: Backend & Hosting Architecture

**Status:** Accepted (12 September 2026)
**Date:** 12 September 2026
**Deciders:** Shop management

## Context

The uniform shop stock system (see `requirements.md`) needs a backend and hosting approach with these constraints:

- Must be **free to host** on an ongoing basis — this is a small volunteer-run school uniform shop, not a funded project.
- Must be **usable on both web and mobile** by a small number of staff (an Admin role and a User/sales-staff role).
- The data is inherently **relational**: supplier orders with line items, deliveries linked to orders, stocktakes that reconcile expected-vs-counted quantities, sales reportable over arbitrary date ranges, and a roster of recurring time slots and school holidays. Reporting (REQ-16, REQ-19–22) and CSV export (REQ-22) depend on being able to filter, group, and join this data easily.
- Two roles need distinct permissions (REQ per section 3): Admin can manage items, orders, deliveries, stocktakes, and roster setup; User can record sales and interact with stock views and the roster, but not orders/deliveries/stocktakes.
- Item photos (REQ-1, REQ-2) need file storage, not just database rows.
- The team maintaining this has limited ongoing engineering capacity — low operational burden matters as much as raw capability.
- No payment processing, no expected traffic beyond a handful of concurrent staff — this is a small-scale internal tool, not a public product.

## Decision

Use **Supabase** (managed Postgres + Authentication + Storage) as the backend, and build the frontend as a **Progressive Web App (PWA)** — a single responsive web app installable to a phone's home screen — hosted for free on a static host (Cloudflare Pages or Vercel).

To avoid Supabase's free-tier project pausing after 7 days of inactivity, set up a trivial scheduled ping (e.g. a free GitHub Actions cron job hitting the project once a day).

This avoids building or paying for a separate native mobile app: the same PWA serves both web and mobile, with no app store account, review process, or per-platform codebase.

## Options Considered

### Option A: Supabase (Postgres) + PWA on a free static host

| Dimension | Assessment |
|---|---|
| Complexity | Low-Medium — managed DB, auth, and storage in one project; still need to write RLS policies for the two roles |
| Cost | $0 at this scale (free tier: DB, 1GB storage, 50k MAU, generous bandwidth) |
| Scalability | Far beyond what a single small shop needs |
| Team familiarity | Assumed low but SQL + a mainstream frontend framework is a common, well-documented stack |

**Pros:** Real relational Postgres database — natural fit for orders/line items/deliveries/stocktake reconciliation/date-range reporting; built-in Auth with Row-Level Security to enforce the Admin/User split; built-in file Storage for item photos; single vendor for DB+auth+storage means less integration work.
**Cons:** Free project auto-pauses after 7 days of no activity (recoverable for up to a year; mitigated with a scheduled ping); some vendor lock-in to Supabase's specific Postgres extensions/Auth APIs if migrating away later.

### Option B: Firebase (Firestore) + Firebase Hosting

| Dimension | Assessment |
|---|---|
| Complexity | Low to start, higher for reporting logic |
| Cost | $0 for Auth/Firestore/Hosting at this scale, but file storage and any backend functions require upgrading to the pay-as-you-go Blaze plan |
| Scalability | Far beyond what's needed |
| Team familiarity | Assumed low; Firestore's NoSQL model is a different mental model from SQL |

**Pros:** Strong free Auth (50k MAU) and Hosting; no project pausing/sleeping behavior.
**Cons:** Cloud Storage (needed for item photos, REQ-1/2) and Cloud Functions are **not available on the free Spark plan** — a card and the Blaze plan would be required even though usage would likely stay near $0; Firestore's document model fights the relational reporting this system needs (stocktake reconciliation, sales-by-period, CSV export), requiring more manual denormalization.

### Option C: Cloudflare (Pages + Workers + D1 + R2)

| Dimension | Assessment |
|---|---|
| Complexity | Medium-High — no bundled Auth/admin layer, more assembly required |
| Cost | $0 (generous free tier across all four services, including zero-egress file storage) |
| Scalability | Far beyond what's needed |
| Team familiarity | Assumed low; smaller ecosystem/tooling than Postgres for D1 |

**Pros:** Everything free with generous limits (Workers 100k req/day, D1 5GB storage + 5M row-reads/day, R2 10GB storage with no egress fees — good for photos); no sleep/pause behavior at all.
**Cons:** No ready-made authentication or admin dashboard — the two-role login system would need to be built from scratch; D1 (SQLite-based) is a thinner, newer ecosystem than Postgres for relational querying.

### Option D: AWS (Lambda + DynamoDB + Cognito, or RDS/S3)

| Dimension | Assessment |
|---|---|
| Complexity | High — IAM, API Gateway, Lambda packaging, Cognito pool configuration all assembled by hand |
| Cost | Lambda, DynamoDB, and Cognito (10k MAU) are genuinely always-free indefinitely; but S3 (file storage) and RDS (relational DB) are **not** always-free — only covered by a one-time 6-month/$100–200 starter credit, after which they're billed |
| Scalability | Far beyond what's needed |
| Team familiarity | Assumed low; steepest learning curve of the options considered |

**Pros:** Genuinely free-forever compute/DB/auth primitives (Lambda, DynamoDB, Cognito) for teams already invested in AWS.
**Cons:** The pieces this project actually needs — file storage for photos and ideally a relational database — aren't in AWS's permanent free tier; the always-free path (DynamoDB) is NoSQL, fighting the same relational-reporting problem as Firebase; no AWS-native free static hosting equivalent to Cloudflare Pages/Vercel, so a second provider would be needed regardless; substantially more manual setup and ongoing maintenance than a managed BaaS.

### Option E: Self-hosted on Oracle Cloud "Always Free" tier

| Dimension | Assessment |
|---|---|
| Complexity | High — full ownership of OS, backups, security patching |
| Cost | $0 (genuinely free-forever compute, storage, and bandwidth, not a trial) |
| Scalability | Sufficient, but limited by the free instance's fixed resources |
| Team familiarity | Assumed low; requires general Linux/ops skills to maintain |

**Pros:** Full control, no vendor free-tier limits or pausing to work around, no recurring cost ever.
**Cons:** Shifts the "cost" from money to ongoing maintenance — OS updates, security patches, and backups become the team's responsibility indefinitely. For a volunteer-run shop with no dedicated IT support, this operational burden is a bigger risk than any of the managed options.

## Trade-off Analysis

The central trade-off is **data model fit vs. free-tier completeness vs. operational simplicity**:

- Firebase and AWS's genuinely-free paths (Firestore, DynamoDB) are NoSQL, which fights this system's relational reporting needs (REQ-16, REQ-19–22) and would mean writing more application-level logic to do what SQL does natively.
- AWS and Cloudflare are the most "fully free forever," but both require assembling more infrastructure by hand (IAM/API Gateway/Lambda for AWS; a custom auth layer for Cloudflare) — more ongoing complexity than a small, low-capacity team should take on for an internal tool.
- Supabase's one real limitation — the free project pausing after a week idle — is a minor, easily-mitigated inconvenience (a free daily ping) compared to the relational-model and free-tier-completeness problems the other options carry.
- Self-hosting (Oracle) removes all platform limits but replaces them with an ongoing maintenance obligation that doesn't fit a volunteer-run shop.

Supabase is the best fit: it's the only option that gives a real relational database, built-in role-based auth, and file storage together, for free, without pushing extra engineering work onto a team that isn't looking for an infrastructure project.

## Consequences

- **Easier:** Reporting and reconciliation queries (stocktake expected-vs-counted, sales by arbitrary period, CSV export) are straightforward SQL; Admin/User permission boundaries are enforced with Postgres Row-Level Security policies rather than hand-rolled checks in application code; a single PWA codebase covers both web and mobile with no app store cost or review process.
- **Harder:** The team takes on a small operational habit (keeping the free project "warm" via a scheduled ping) that a paid or self-hosted setup wouldn't require; if Supabase's free tier terms change unfavorably in the future, migrating a Postgres database elsewhere is possible but not zero-effort.
- **To revisit:** If the shop ever needs push notifications to staff phones, iOS's historically limited PWA support for that would need re-evaluating (out of scope per current requirements, section 7); if usage ever meaningfully exceeds the free tier, moving to a small paid Supabase plan is the natural next step rather than re-architecting.

## Action Items

1. [ ] Confirm this decision (Status → Accepted) or flag concerns before implementation begins
2. [ ] Create the Supabase project and set up the database schema (see `database-schema.md`)
3. [ ] Define Row-Level Security policies for the Admin and User roles
4. [ ] Scaffold the PWA with **Vite + React** (decided — see Amendment 4) and confirm PWA installability (manifest + service worker)
5. [ ] Set up the free hosting project on **Cloudflare Pages** (decided — see Amendment 3) and connect it to the Git repository
6. [ ] Set up the scheduled keep-alive ping (GitHub Actions cron) to prevent the Supabase free-tier pause

## Amendments

### Amendment 1 (12 September 2026): Photo storage moved into Postgres, Supabase Storage dropped

Following a request to keep the number of cloud services as small as possible, item photos are no longer stored in Supabase Storage. Instead, each photo is compressed and resized client-side (roughly 400px on the long edge, capped around 100KB) and stored as a `bytea` blob directly in Postgres, in a dedicated `item_photos` table (see `database-schema.md`). This removes Supabase Storage from the architecture entirely — the system now uses exactly one backend service (Supabase's Postgres database + Auth) instead of two.

**Trade-off accepted:** the database grows somewhat larger and backups get a bit heavier as photos are added (bounded in practice — a catalog of a few hundred items at ~100KB each is only tens of MB total, well inside the free tier). If the shop ever wants sharper or larger photos than this cap comfortably allows, this should be revisited and moved to a real file-storage service instead.

See ADR-002 for the related decision on infrastructure-as-code and repository structure.

### Amendment 2 (12 September 2026): Options reassessed after Amendment 1 and ADR-002

Two decisions made since the original comparison in this ADR — dropping Supabase Storage (Amendment 1) and adopting a lightweight, migrations-based IaC approach instead of Terraform (ADR-002) — change the shape of the problem enough to warrant re-checking each option, especially now that `database-schema.md` commits to concrete, Postgres-specific features (Row-Level Security, `enum` types, `uuid`/`gen_random_uuid()`, `bytea` blob columns, and triggers that maintain a cached stock quantity).

- **Supabase — still the right fit, arguably more so now.** With Storage no longer needed, the backend is just two tightly-coupled parts of one project (Postgres + Auth) rather than three separate services. The photo size math holds up comfortably: even a few hundred items at ~100KB each is only tens of MB, nowhere near the free tier's 500MB database cap.
- **Firebase — reassessed, still not a good fit.** Removing the file-storage need removes one of the two original objections (Storage requiring the paid Blaze plan), but the schema's stock-ledger design relies on a database trigger to keep cached quantities in sync — Firestore has no equivalent, so that logic would need a Cloud Function, which (like Storage) isn't on the free Spark plan either. The core relational-vs-NoSQL mismatch is unchanged, and now more visible with the schema fully written out in Postgres-specific SQL.
- **Cloudflare (D1) — reassessed, weaker than before.** Dropping the photo-storage need removes R2's main advantage (free, zero-egress file storage) from the comparison, since there's no file left to store. What stands out now is that D1 (SQLite) has no equivalent to Postgres Row-Level Security, which the schema doc relies on directly to enforce the Admin/User split at the database layer — moving here would mean re-implementing all of that as manual checks inside Workers code. Still no bundled Auth either.
- **AWS — reassessed, essentially unchanged.** The always-free services (Lambda, DynamoDB, Cognito) never included a genuinely-free relational database, and that was never about file storage — so removing the photo-storage need doesn't move this one much. DynamoDB remains NoSQL, and the schema's Postgres-specific RLS/enums/triggers would need a substantial redesign to port.
- **Self-hosted Postgres (Oracle Always Free) — reassessed, still not preferred.** This would remove any free-tier database-size ceiling and keep RLS available (it's genuine Postgres), which is more relevant now that photos live in the database. But it reintroduces exactly the operational burden ADR-002 just chose to avoid — patching and backing up a VM by hand, plus losing Supabase's built-in Auth product and needing to build login/session handling from scratch.

**Conclusion:** the reassessment reaffirms Supabase + PWA — if anything more clearly than the original comparison, since the concrete schema now committed to depends on Postgres-specific capabilities that only a real Postgres offering provides. Recommend moving this ADR's status from Proposed to Accepted unless something here doesn't sit right.

### Amendment 3 (12 September 2026): Frontend host narrowed to Cloudflare Pages

The original decision left the frontend host as "Cloudflare Pages or Vercel" — either free static host would work technically. Checking Vercel's current terms closes that off: Vercel's free **Hobby** plan is explicitly restricted to non-commercial, personal use under its fair-use guidelines. A uniform shop is a small commercial operation (it sells goods, even if not-for-profit-adjacent), so hosting it on Vercel's free tier would be a real terms-of-service risk, not just a style preference. Cloudflare Pages' free plan carries no such non-commercial restriction. **Decision: use Cloudflare Pages**, not Vercel, for the frontend host.

### Amendment 4 (12 September 2026): Frontend framework decided — Vite + React

Between a lightweight SvelteKit build (less boilerplate, smaller output) and Vite + React (the more mainstream choice, easiest to find help with or hand off to another developer later), **Vite + React was chosen**, prioritizing ease of finding help and future maintainability over the marginal build-size/verbosity advantage SvelteKit would have offered at this small scale.
