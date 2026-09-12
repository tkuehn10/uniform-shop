-- ============================================================================
-- Uniform Shop Stock System — Initial schema
-- Mirrors database-schema.md (v0.5) in /docs. Keep that file and this
-- migration in sync — the markdown doc is the human-readable source of
-- truth for *why*, this migration is what actually runs.
-- ============================================================================

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

comment on table profiles is 'App-specific user info + role. One row per auth.users row. Rows are created manually (no in-app signup) — see docs/screens-and-flows.md section 4.';

-- ============================================================
-- Items
-- ============================================================

create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  price numeric(10,2),                    -- reference only, no payment processing (A4)
  active boolean not null default true,   -- archived, not deleted, when false (REQ-36, REQ-37, A15)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table item_photos (
  item_id uuid primary key references items(id) on delete cascade,
  image_data bytea not null,      -- compressed image bytes, resized to ~400px long edge (REQ-1, ADR-001 Amendment 1)
  content_type text not null,     -- e.g. 'image/webp'
  byte_size int not null,         -- app-enforced cap (~100KB) checked before insert
  updated_at timestamptz not null default now()
);
comment on table item_photos is 'One row per item; a new upload replaces the row wholesale. Kept separate from items so listing/searching items never has to read image bytes.';

create table item_sizes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  size_label text not null,                  -- e.g. "10", "M", "XL"
  sort_order int not null default 0,
  quantity_on_hand int not null default 0,   -- cached, derived from stock_movements
  active boolean not null default true,      -- a size can be archived independently of its item (REQ-36, REQ-37)
  created_at timestamptz not null default now(),
  unique (item_id, size_label)
);

create index item_sizes_item_id_idx on item_sizes (item_id);

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
  note text,                          -- required (enforced in app) for manual_adjustment (REQ-35)
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index stock_movements_item_size_id_created_at_idx on stock_movements (item_size_id, created_at);
create index stock_movements_created_at_idx on stock_movements (created_at);

-- Keep item_sizes.quantity_on_hand in sync with the ledger.
create or replace function apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update item_sizes
  set quantity_on_hand = quantity_on_hand + new.quantity_delta
  where id = new.item_size_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on stock_movements
  for each row execute function apply_stock_movement();

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
  unique (supplier_id, order_number)    -- unique per supplier, not globally (database-schema.md section 5)
);

create index orders_supplier_id_idx on orders (supplier_id);
create index orders_status_idx on orders (status);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_size_id uuid not null references item_sizes(id),
  quantity_ordered int not null check (quantity_ordered > 0)
);

create index order_lines_order_id_idx on order_lines (order_id);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  delivery_date date not null,
  received_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index deliveries_order_id_idx on deliveries (order_id);

create table delivery_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  order_line_id uuid not null references order_lines(id),
  quantity_received int not null check (quantity_received > 0)
);

create index delivery_lines_delivery_id_idx on delivery_lines (delivery_id);
create index delivery_lines_order_line_id_idx on delivery_lines (order_line_id);

-- On each delivery line: record the stock movement, and re-evaluate the
-- parent order's status (REQ-7: moves to partially_received / fully_received).
create or replace function apply_delivery_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_size_id uuid;
  v_order_id uuid;
  v_all_fully_received boolean;
  v_any_received boolean;
  v_current_status order_status;
begin
  select ol.item_size_id, ol.order_id
    into v_item_size_id, v_order_id
    from order_lines ol
   where ol.id = new.order_line_id;

  insert into stock_movements (item_size_id, quantity_delta, reason, reference_table, reference_id, created_by)
  values (
    v_item_size_id,
    new.quantity_received,
    'delivery',
    'delivery_lines',
    new.id,
    (select received_by from deliveries where id = new.delivery_id)
  );

  select status into v_current_status from orders where id = v_order_id;

  -- Only auto-advance while the order is still in its "receiving" phase —
  -- never clobber a status that's already moved past receiving (Admin may
  -- have overridden it manually; REQ-13).
  if v_current_status in ('order_placed', 'partially_received', 'fully_received') then
    select
      bool_and(coalesce(received.total, 0) >= ol.quantity_ordered),
      bool_or(coalesce(received.total, 0) > 0)
      into v_all_fully_received, v_any_received
    from order_lines ol
    left join (
      select dl.order_line_id, sum(dl.quantity_received) as total
      from delivery_lines dl
      group by dl.order_line_id
    ) received on received.order_line_id = ol.id
    where ol.order_id = v_order_id;

    update orders
    set status = case when v_all_fully_received then 'fully_received'::order_status
                       when v_any_received then 'partially_received'::order_status
                       else status end,
        updated_at = now()
    where id = v_order_id;
  end if;

  return new;
end;
$$;

create trigger delivery_lines_apply
  after insert on delivery_lines
  for each row execute function apply_delivery_line();

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

create index stocktake_counts_stocktake_id_idx on stocktake_counts (stocktake_id);

create or replace function apply_stocktake_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into stock_movements (item_size_id, quantity_delta, reason, reference_table, reference_id, created_by)
  values (
    new.item_size_id,
    new.counted_quantity - new.expected_quantity,
    'stocktake_adjustment',
    'stocktake_counts',
    new.id,
    (select created_by from stocktakes where id = new.stocktake_id)
  );
  return new;
end;
$$;

create trigger stocktake_counts_apply
  after insert on stocktake_counts
  for each row execute function apply_stocktake_count();

-- ============================================================
-- Sales
-- ============================================================

create table sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index sales_sold_at_idx on sales (sold_at);

create table sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  item_size_id uuid not null references item_sizes(id),
  quantity int not null check (quantity > 0)
);

create index sale_lines_sale_id_idx on sale_lines (sale_id);
create index sale_lines_item_size_id_idx on sale_lines (item_size_id);

-- REQ-24: negative resulting quantity_on_hand is allowed (no DB constraint blocking it);
-- the app shows a warning before submit, this trigger just applies it either way.
create or replace function apply_sale_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into stock_movements (item_size_id, quantity_delta, reason, reference_table, reference_id, created_by)
  values (
    new.item_size_id,
    -new.quantity,
    'sale',
    'sale_lines',
    new.id,
    (select created_by from sales where id = new.sale_id)
  );
  return new;
end;
$$;

create trigger sale_lines_apply
  after insert on sale_lines
  for each row execute function apply_sale_line();

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

create index roster_claims_occurrence_date_idx on roster_claims (occurrence_date);

create table school_holidays (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  label text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Housekeeping: keep updated_at columns honest
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();

create trigger orders_set_updated_at before update on orders
  for each row execute function set_updated_at();
