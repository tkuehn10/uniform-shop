-- ============================================================================
-- Row-Level Security policies
-- Mirrors database-schema.md section 4. Every table gets RLS enabled;
-- nothing is readable/writable by default once enabled — only what a
-- policy below explicitly allows.
-- ============================================================================

-- ------------------------------------------------------------------
-- Helper: is the current authenticated user an Admin?
-- security definer so this bypasses RLS on `profiles` itself (avoids
-- recursive policy evaluation) and always sees the true row.
-- ------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ------------------------------------------------------------------
-- profiles
-- Any signed-in user can read all profiles (just display_name + role,
-- nothing sensitive) — used to show "delivered by", "claimed by", etc.
-- Nobody can insert/update/delete via the app; provisioning is manual
-- (see docs/screens-and-flows.md section 4), done with the service_role
-- key which bypasses RLS entirely.
-- ------------------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles_select_authenticated" on profiles
  for select to authenticated using (true);

-- ------------------------------------------------------------------
-- Items & photos & sizes — Admin-managed, everyone can read
-- ------------------------------------------------------------------
alter table items enable row level security;
create policy "items_select_authenticated" on items for select to authenticated using (true);
create policy "items_admin_write" on items for all to authenticated using (is_admin()) with check (is_admin());

alter table item_photos enable row level security;
create policy "item_photos_select_authenticated" on item_photos for select to authenticated using (true);
create policy "item_photos_admin_write" on item_photos for all to authenticated using (is_admin()) with check (is_admin());

alter table item_sizes enable row level security;
create policy "item_sizes_select_authenticated" on item_sizes for select to authenticated using (true);
create policy "item_sizes_admin_write" on item_sizes for all to authenticated using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------------
-- Stock ledger — everyone can read (reports need it); no direct client
-- writes except Admin manual adjustments. Delivery/sale/stocktake rows
-- are written only by the security-definer trigger functions, which
-- bypass RLS, so they're unaffected by this policy being restrictive.
-- ------------------------------------------------------------------
alter table stock_movements enable row level security;
create policy "stock_movements_select_authenticated" on stock_movements for select to authenticated using (true);
create policy "stock_movements_admin_manual_insert" on stock_movements
  for insert to authenticated
  with check (is_admin() and reason = 'manual_adjustment');

-- ------------------------------------------------------------------
-- Suppliers & orders — Admin-managed, everyone can read
-- ------------------------------------------------------------------
alter table suppliers enable row level security;
create policy "suppliers_select_authenticated" on suppliers for select to authenticated using (true);
create policy "suppliers_admin_write" on suppliers for all to authenticated using (is_admin()) with check (is_admin());

alter table orders enable row level security;
create policy "orders_select_authenticated" on orders for select to authenticated using (true);
create policy "orders_admin_write" on orders for all to authenticated using (is_admin()) with check (is_admin());

alter table order_lines enable row level security;
create policy "order_lines_select_authenticated" on order_lines for select to authenticated using (true);
create policy "order_lines_admin_write" on order_lines for all to authenticated using (is_admin()) with check (is_admin());

alter table deliveries enable row level security;
create policy "deliveries_select_authenticated" on deliveries for select to authenticated using (true);
create policy "deliveries_admin_write" on deliveries for all to authenticated using (is_admin()) with check (is_admin());

alter table delivery_lines enable row level security;
create policy "delivery_lines_select_authenticated" on delivery_lines for select to authenticated using (true);
create policy "delivery_lines_admin_write" on delivery_lines for all to authenticated using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------------
-- Stocktakes — Admin-managed, everyone can read
-- ------------------------------------------------------------------
alter table stocktakes enable row level security;
create policy "stocktakes_select_authenticated" on stocktakes for select to authenticated using (true);
create policy "stocktakes_admin_write" on stocktakes for all to authenticated using (is_admin()) with check (is_admin());

alter table stocktake_counts enable row level security;
create policy "stocktake_counts_select_authenticated" on stocktake_counts for select to authenticated using (true);
create policy "stocktake_counts_admin_write" on stocktake_counts for all to authenticated using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------------
-- Sales — both roles can read and write (REQ-23)
-- ------------------------------------------------------------------
alter table sales enable row level security;
create policy "sales_select_authenticated" on sales for select to authenticated using (true);
create policy "sales_insert_authenticated" on sales for insert to authenticated with check (true);

alter table sale_lines enable row level security;
create policy "sale_lines_select_authenticated" on sale_lines for select to authenticated using (true);
create policy "sale_lines_insert_authenticated" on sale_lines for insert to authenticated with check (true);

-- ------------------------------------------------------------------
-- Roster — recurring pattern is Admin-managed; claims are open to both
-- roles (REQ-27, REQ-28); holidays are Admin-managed.
-- ------------------------------------------------------------------
alter table opening_time_slots enable row level security;
create policy "opening_time_slots_select_authenticated" on opening_time_slots for select to authenticated using (true);
create policy "opening_time_slots_admin_write" on opening_time_slots for all to authenticated using (is_admin()) with check (is_admin());

alter table roster_claims enable row level security;
create policy "roster_claims_select_authenticated" on roster_claims for select to authenticated using (true);
create policy "roster_claims_insert_authenticated" on roster_claims for insert to authenticated with check (true);
create policy "roster_claims_delete_authenticated" on roster_claims for delete to authenticated using (true);

alter table school_holidays enable row level security;
create policy "school_holidays_select_authenticated" on school_holidays for select to authenticated using (true);
create policy "school_holidays_admin_write" on school_holidays for all to authenticated using (is_admin()) with check (is_admin());
