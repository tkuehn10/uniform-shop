-- Not part of the migrations — a throwaway local smoke test for the schema + RLS,
-- run against a plain local Postgres with a stubbed auth schema. Not applied to
-- the real Supabase project. Safe to delete once confidence is high.

\set ON_ERROR_STOP on

-- ---- Setup as superuser (bypasses RLS) ----
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'staff@example.com');

insert into profiles (id, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Ada Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Uma User', 'user');

insert into items (id, name, category) values
  ('33333333-3333-3333-3333-333333333333', 'Boys Short Sleeve Shirt', 'Shirts');

insert into item_sizes (id, item_id, size_label, sort_order) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '10', 1);

insert into suppliers (id, name) values
  ('55555555-5555-5555-5555-555555555555', 'ACME Uniforms');

\echo '--- as ADMIN (authenticated, manual stock adjustment = initial stock entry) ---'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into stock_movements (item_size_id, quantity_delta, reason, note, created_by)
values ('44444444-4444-4444-4444-444444444444', 20, 'manual_adjustment', 'Initial stock setup', '11111111-1111-1111-1111-111111111111');

select 'after initial stock entry, expect 20' as check, quantity_on_hand from item_sizes where id = '44444444-4444-4444-4444-444444444444';

\echo '--- as USER, manual_adjustment insert should be REJECTED by RLS ---'
reset request.jwt.claim.sub;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  begin
    insert into stock_movements (item_size_id, quantity_delta, reason, note, created_by)
    values ('44444444-4444-4444-4444-444444444444', 5, 'manual_adjustment', 'sneaky', '22222222-2222-2222-2222-222222222222');
    raise exception 'SHOULD NOT HAVE BEEN ALLOWED';
  exception when insufficient_privilege then
    raise notice 'correctly rejected: user cannot insert manual_adjustment';
  end;
end $$;

\echo '--- as USER, record a sale (allowed) ---'
insert into sales (id, created_by) values ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222');
insert into sale_lines (sale_id, item_size_id, quantity) values ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 3);

select 'after selling 3, expect 17' as check, quantity_on_hand from item_sizes where id = '44444444-4444-4444-4444-444444444444';

\echo '--- as USER, item creation should be REJECTED ---'
do $$
begin
  begin
    insert into items (name) values ('Sneaky Item');
    raise exception 'SHOULD NOT HAVE BEEN ALLOWED';
  exception when insufficient_privilege then
    raise notice 'correctly rejected: user cannot insert items';
  end;
end $$;

\echo '--- back to ADMIN: create an order, deliver it partially then fully ---'
reset request.jwt.claim.sub;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into orders (id, order_number, supplier_id, order_date, created_by)
values ('77777777-7777-7777-7777-777777777777', 'PO-1001', '55555555-5555-5555-5555-555555555555', current_date, '11111111-1111-1111-1111-111111111111');

insert into order_lines (id, order_id, item_size_id, quantity_ordered)
values ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', 10);

insert into deliveries (id, order_id, delivery_date, received_by)
values ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', current_date, '11111111-1111-1111-1111-111111111111');

insert into delivery_lines (delivery_id, order_line_id, quantity_received)
values ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888', 4);

select 'after partial delivery of 4/10, expect status partially_received' as check, status from orders where id = '77777777-7777-7777-7777-777777777777';
select 'after partial delivery of 4/10, expect stock 21 (17+4)' as check, quantity_on_hand from item_sizes where id = '44444444-4444-4444-4444-444444444444';

insert into deliveries (id, order_id, delivery_date, received_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', current_date, '11111111-1111-1111-1111-111111111111');

insert into delivery_lines (delivery_id, order_line_id, quantity_received)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 6);

select 'after 2nd delivery of 6 (10/10 total), expect status fully_received' as check, status from orders where id = '77777777-7777-7777-7777-777777777777';
select 'expect stock 27 (21+6)' as check, quantity_on_hand from item_sizes where id = '44444444-4444-4444-4444-444444444444';

\echo '--- ADMIN performs a stocktake, counts fewer than expected ---'
insert into stocktakes (id, stocktake_date, scope, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, 'spot', '11111111-1111-1111-1111-111111111111');

insert into stocktake_counts (stocktake_id, item_size_id, expected_quantity, counted_quantity, calculated_sold)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 27, 25, 2);

select 'after stocktake trues up to counted 25' as check, quantity_on_hand from item_sizes where id = '44444444-4444-4444-4444-444444444444';

\echo '--- USER claims and un-claims a roster slot ---'
reset request.jwt.claim.sub;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  begin
    insert into opening_time_slots (day_of_week, start_time, end_time) values (2, '08:30', '09:30');
    raise exception 'SHOULD NOT HAVE BEEN ALLOWED';
  exception when insufficient_privilege then
    raise notice 'correctly rejected: user cannot manage the roster pattern';
  end;
end $$;

reset request.jwt.claim.sub;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into opening_time_slots (id, day_of_week, start_time, end_time)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 2, '08:30', '09:30');

reset request.jwt.claim.sub;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into roster_claims (opening_time_slot_id, occurrence_date, claimed_name, claimed_by)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', current_date + 7, 'Uma User', '22222222-2222-2222-2222-222222222222');

select 'roster claim created by user, expect 1 row' as check, count(*) from roster_claims;

delete from roster_claims where opening_time_slot_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select 'roster claim un-claimed by user, expect 0 rows' as check, count(*) from roster_claims;

reset role;
\echo 'ALL CHECKS COMPLETE'
