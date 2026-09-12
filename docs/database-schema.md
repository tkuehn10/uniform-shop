# Database Schema — Uniform Shop Stock System

**Version:** 0.7 (draft)
**Date:** 12 September 2026
**Target platform:** Postgres via Supabase (see `adr-001-backend-hosting.md`)

This document turns the conceptual data model in `requirements.md` (section 4) into concrete tables. Every table below is traceable back to the requirement(s) it supports.

## 1. Design notes

- **Item photos live in Postgres, not a separate file-storage service.** Per ADR-001's amendment, photos are compressed/resized client-side (roughly 400px on the long edge, stepping down to 320/240/160px and through a quality ladder if needed) and stored as `bytea` blobs in their own `item_photos` table, capped at 50KB — kept separate from `items` so that browsing/searching the item catalog never has to read image bytes. This keeps the system to one backend service instead of two, at the cost of a somewhat larger database as photos are added (acceptable at this catalog size — see ADR-001 Amendment 1).
- **Stock is a ledger, not just a counter.** Every event that changes stock (a delivery received, a sale, a stocktake adjustment) is recorded as a row in `stock_movements`. The current on-hand quantity for an item/size is the sum of its movements — kept fast to read via a cached `quantity_on_hand` column on `item_sizes` that's updated whenever a movement is inserted. This gives an audit trail for free (every stock change is traceable to its cause) and makes stocktake reconciliation (REQ-16, REQ-17) and sales reporting (REQ-19–22) straightforward sums/filters over one table instead of recomputing from scratch.
- **Roles are enforced with Postgres Row-Level Security (RLS)**, not just application code. Each authenticated user has a `profiles` row with a `role` of `admin` or `user`. RLS policies on each table check this role, so even a bug in the frontend can't let a User perform an Admin-only action.
- **Users are Supabase Auth users** (`auth.users`, managed by Supabase) with a matching `public.profiles` row for app-specific fields (display name, role). This is the standard Supabase pattern.
- **There is no in-app screen for creating staff logins.** New logins are provisioned manually (Supabase dashboard or a short script) — see `screens-and-flows.md` section 4 for the exact steps. This is a deliberate simplification given how rarely staff are added.
- **Item categories are a fixed, mandatory set**, not free text: `item_category` is a Postgres enum (`Tops`, `Bottoms`, `Hats`, `Socks`), and `items.category` is `not null`. The dropdown in the Admin item-edit screen is the only way to set it, matching requirements.md REQ-1.
- All tables use `uuid` primary keys (Postgres `gen_random_uuid()`) and `created_at`/`updated_at` timestamps unless noted.

## 2. Table summary

| Table | Purpose | Key requirement(s) |
|---|---|---|
| `profiles` | App-specific user info + role | Section 3 (roles) |
| `items` | Uniform products | REQ-1, REQ-2, REQ-36, REQ-37 |
| `item_photos` | One compressed photo per item, stored in-database | REQ-1, REQ-2 |
| `item_sizes` | Sizes offered per item, with cached on-hand quantity | REQ-1, A5, REQ-36, REQ-37 |
| `stock_movements` | Ledger of every stock change | REQ-7, REQ-17, REQ-23, REQ-34, REQ-35 |
| `suppliers` | Remembered supplier names | REQ-3, REQ-4 |
| `orders` | Supplier purchase orders | REQ-3, REQ-5, REQ-6 |
| `order_lines` | Items/sizes/quantities on an order | REQ-3 |
| `deliveries` | A delivery event against an order | REQ-7, REQ-9 |
| `delivery_lines` | Quantities received per item/size in a delivery | REQ-7, REQ-8 |
| `stocktakes` | A stocktake event | REQ-15, REQ-18 |
| `stocktake_counts` | Counted quantity per item/size in a stocktake | REQ-15, REQ-16, REQ-17 |
| `sales` | A sale transaction | REQ-23 |
| `sale_lines` | Items/sizes/quantities in a sale | REQ-23, REQ-24 |
| `opening_time_slots` | Recurring weekly opening-time pattern | REQ-25, REQ-29 |
| `roster_claims` | A name claiming a specific date's slot occurrence | REQ-27, REQ-28 |
| `school_holidays` | Holiday date ranges | REQ-30, REQ-33 |

## 3. Schema (Postgres DDL)

```sql
-- ============================================================
-- Users & roles
-- ============================================================

create type user_role as enum ('admin', 'user');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role user_role not null default 'user',
  created_at timestamptz not null default now()
);

-- ============================================================
-- Items
-- ============================================================

create type item_category as enum ('Tops', 'Bottoms', 'Hats', 'Socks');
-- Fixed, mandatory set (requirements.md REQ-1) -- chosen from a dropdown in
-- the Admin item-edit screen, not typed. Added in migration
-- 20260912000002_item_categories.sql, which also backfills any pre-existing
-- item with a null/unrecognized category to 'Tops' before applying the
-- not-null constraint below (see that migration's own comments).

create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category item_category not null,
  price numeric(10,2),           -- reference only, no payment processing (A4)
  active boolean not null default true,   -- archived, not deleted, when false (REQ-36, REQ-37, A15)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table item_photos (
  item_id uuid primary key references items(id) on delete cascade,
  image_data bytea not null,      -- compressed image bytes, resized to ~400px long edge (REQ-1, ADR-001 Amendment 1)
  content_type text not null,     -- e.g. 'image/webp'
  byte_size int not null,         -- app-enforced cap (~50KB) checked before insert
  updated_at timestamptz not null default now()
);
-- One row per item (primary key = item_id); a new upload replaces the row wholesale.
-- Kept as its own table (rather than a column on items) so that listing/searching items
-- never has to read image bytes off disk.

create table item_sizes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  size_label text not null,      -- e.g. "10", "M", "XL"
  sort_order int not null default 0,
  quantity_on_hand int not null default 0,   -- cached, derived from stock_movements
  active boolean not null default true,      -- a size can be archived independently of its item (REQ-36, REQ-37)
  created_at timestamptz not null default now(),
  unique (item_id, size_label)
);
-- Day-to-day pickers (sales, order creation, stock browsing) filter to active items/sizes only,
-- unless the Admin explicitly asks to see archived ones. Historical rows (orders, deliveries,
-- stocktakes, sales) keep referencing an archived item/size unchanged.

-- ============================================================
-- Stock ledger (source of truth for all stock changes)
-- ============================================================

create type stock_movement_reason as enum ('delivery', 'sale', 'stocktake_adjustment', 'manual_adjustment');

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_size_id uuid not null references item_sizes(id),
  quantity_delta int not null,        -- positive for delivery/upward adjustment, negative for sale/downward adjustment
  reason stock_movement_reason not null,
  reference_table text,               -- 'delivery_lines' | 'sale_lines' | 'stocktake_counts' | null for manual_adjustment
  reference_id uuid,                  -- id of the row that caused this movement; null for manual_adjustment
  note text,                          -- required (enforced in app) for manual_adjustment (REQ-35); auto-filled
                                       -- e.g. "Initial stock setup" for the bulk entry screen (REQ-34)
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
-- A trigger on insert updates item_sizes.quantity_on_hand += quantity_delta.
-- Rows with reason in ('delivery','sale','stocktake_adjustment') are only ever created by triggers on
-- delivery_lines/sale_lines/stocktake_counts inserts (see below) — the app never inserts them directly.
-- Rows with reason = 'manual_adjustment' (REQ-34, REQ-35) are the one case the app inserts into this
-- table directly, since there's no separate line-item table behind a manual adjustment.

-- ============================================================
-- Suppliers & orders
-- ============================================================

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create type order_status as enum (
  'order_placed',
  'partially_received',
  'fully_received',
  'invoice_checked',
  'invoice_sent_to_treasurer',
  'closed'
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,          -- free-text, e.g. supplier's PO number (A7)
  supplier_id uuid not null references suppliers(id),
  order_date date not null,
  status order_status not null default 'order_placed',
  invoice_check_note text,             -- optional discrepancy note (REQ-10, A9)
  invoice_sent_date date,              -- REQ-11
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, order_number)    -- unique per supplier, not globally (decision, see section 5)
);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_size_id uuid not null references item_sizes(id),
  quantity_ordered int not null check (quantity_ordered > 0)
);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  delivery_date date not null,
  received_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table delivery_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  order_line_id uuid not null references order_lines(id),
  quantity_received int not null check (quantity_received > 0)
);
-- Each insert here also inserts a matching stock_movements row (reason = 'delivery').

-- ============================================================
-- Stocktakes
-- ============================================================

create type stocktake_scope as enum ('full', 'spot');

create table stocktakes (
  id uuid primary key default gen_random_uuid(),
  stocktake_date date not null,
  scope stocktake_scope not null default 'full',   -- REQ-15
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table stocktake_counts (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references stocktakes(id) on delete cascade,
  item_size_id uuid not null references item_sizes(id),
  expected_quantity int not null,     -- system's on-hand quantity at time of count (REQ-16)
  counted_quantity int not null,      -- physically counted quantity
  calculated_sold int not null,       -- expected_quantity - counted_quantity (REQ-17)
  unique (stocktake_id, item_size_id)
);
-- Each insert here also inserts a matching stock_movements row
-- (reason = 'stocktake_adjustment', quantity_delta = counted_quantity - expected_quantity).

-- ============================================================
-- Sales
-- ============================================================

create table sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  item_size_id uuid not null references item_sizes(id),
  quantity int not null check (quantity > 0)
);
-- Each insert here also inserts a matching stock_movements row (reason = 'sale', quantity_delta = -quantity).
-- REQ-24: negative resulting quantity_on_hand is allowed (no DB constraint blocking it), app shows a warning before submit.

-- ============================================================
-- Roster
-- ============================================================

create table opening_time_slots (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  active boolean not null default true,   -- soft-disable instead of deleting (REQ-29)
  created_at timestamptz not null default now()
);

create table roster_claims (
  id uuid primary key default gen_random_uuid(),
  opening_time_slot_id uuid not null references opening_time_slots(id),
  occurrence_date date not null,          -- the specific date this claim is for
  claimed_name text not null,             -- free text, not necessarily the logged-in user (A12)
  claimed_by uuid references profiles(id),
  claimed_at timestamptz not null default now(),
  unique (opening_time_slot_id, occurrence_date)   -- one claim per slot per date (A11)
);
-- Un-claiming (REQ-28) deletes the row.

create table school_holidays (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  label text,
  created_at timestamptz not null default now()
);
-- The app checks a slot occurrence's date against school_holidays ranges to suppress it (REQ-32);
-- no separate table needed to mark which slots are suppressed.
```

## 4. Row-Level Security approach

Every table above has RLS enabled. The general pattern:

- **Read access:** most tables (items, item_sizes, orders, stock views, roster, holidays) are readable by any authenticated user (Admin or User), since REQ-14 and REQ-26 require both roles to view stock and the roster.
- **Write access split by role:**
  - `items`, `item_photos`, `item_sizes`, `orders`, `order_lines`, `deliveries`, `delivery_lines`, `stocktakes`, `stocktake_counts`, `suppliers`, `opening_time_slots`, `school_holidays` — insert/update/delete restricted to `role = 'admin'`. This covers archiving/restoring an item or size (REQ-36, REQ-37), since both are just an update to `items.active` / `item_sizes.active`.
  - `sales`, `sale_lines`, `roster_claims` — insert/update/delete allowed for any authenticated user (Admin or User), per REQ-23 and REQ-27/28.
  - `stock_movements` — rows with reason `delivery`, `sale`, or `stocktake_adjustment` are only ever inserted by triggers, so no client insert policy is needed for those. Rows with reason `manual_adjustment` (REQ-34, REQ-35) are inserted directly by the app, so this table needs one insert policy restricted to `role = 'admin'`.
- A helper SQL function (e.g. `is_admin()`) reads the caller's `profiles.role` and is reused across policies rather than repeating the same subquery everywhere.

## 5. Decisions (previously open questions)

1. **`order_number` uniqueness:** unique per supplier (`unique (supplier_id, order_number)`), not globally unique — two different suppliers may coincidentally use overlapping PO numbering schemes, and there's no need to prevent that.
2. **CSV export (REQ-22):** a plain query-and-download from the frontend (build the CSV client-side from the already-fetched report data) — no dedicated export endpoint or service needed at this scale.
3. **Roster claims / school holidays history:** overwrite-in-place, no audit trail — consistent with keeping the roster "very simple" (A11). Revisit only if disputes over who claimed/removed a slot become a real problem in practice.

## 6. Change log

- **v0.7:** Lowered the client-side photo compression cap from ~100KB to ~50KB (`src/lib/photo.ts`). The compressor now also steps the resize dimension down through 320/240/160px (in addition to the existing quality ladder) if 400px doesn't fit under the new, tighter cap at any quality level, so ordinary product photos still land under 50KB rather than just settling for the smallest/blurriest result at a fixed size.
- **v0.6:** Item categories are now mandatory and restricted to a fixed set instead of optional free text: added the `item_category` enum (`Tops`, `Bottoms`, `Hats`, `Socks`) and made `items.category` `not null` — `supabase/migrations/20260912000002_item_categories.sql`. Existing rows with a null or unrecognized category are backfilled to `'Tops'` by that migration rather than failing it.
- **v0.5:** Resolved all three remaining open questions as decisions: `order_number` is unique per supplier (added as a DB constraint), CSV export is a plain client-side query-and-download, and roster/holiday edits are overwrite-in-place with no audit trail.
- **v0.4:** Moved item photos out of Supabase Storage and into Postgres — dropped `items.photo_url`, added a dedicated `item_photos` table storing compressed image bytes (`bytea`), per ADR-001 Amendment 1. Reduces the backend to a single service (Postgres + Auth), at the cost of a somewhat larger database as photos are added.
- **v0.3:** Added `active` flags on `items` and `item_sizes` for archiving (REQ-36, REQ-37), a `manual_adjustment` reason and `note` column on `stock_movements` to cover initial stock entry and ad-hoc corrections (REQ-34, REQ-35), and a matching RLS insert policy for direct manual-adjustment writes.
- **v0.2:** Noted that staff logins are provisioned manually (no in-app management screen), matching the decision in `screens-and-flows.md`.
- **v0.1:** Initial draft.
