# Screens & User Flows — Uniform Shop Stock System

**Version:** 0.6 (draft)
**Date:** 22 September 2026

A working inventory of every screen the app needs, who can use it, and what it does — built from `requirements.md`. Use this as a build checklist and to catch missing flows before coding starts.

## 1. Navigation structure

A simple tab/menu structure, with Admin-only sections hidden or disabled for the User role:

- **Stock** — browse current stock (both roles)
- **Sales** — record a sale (both roles)
- **Orders** — supplier orders & deliveries (Admin only)
- **Stocktake** — start/view stocktakes (Admin only)
- **Reports** — sales reporting & CSV export (both roles)
- **Roster** — calendar, claim/un-claim shifts (both roles)
- **Settings** — items, opening times, school holidays (Admin only)

One page sits outside the menu on purpose: **Change password** (2.18), which any logged-in user reaches by typing `/change-password` into the address bar.

## 2. Screens

### 2.1 Login

- **Who:** everyone (unauthenticated)
- **Purpose:** authenticate as Admin or User.
- **Elements:** username + password. Supabase Auth itself only has emails, so each login is provisioned with a synthetic `<username>@`-domain address behind the scenes (section 4) — staff never see or type an email. There is no in-app screen for creating or managing staff logins — new logins are provisioned manually outside the app — though staff can change their own password (2.18).

### 2.2 Stock overview

- **Who:** Admin, User
- **Requirements:** REQ-14
- **Purpose:** browse current on-hand stock.
- **Elements:** list/grid of items with photo, name, category filter, search; expanding an item shows on-hand quantity per size.

### 2.3 Item detail / edit

- **Who:** view — Admin, User; edit — Admin only
- **Requirements:** REQ-1, REQ-2, REQ-35, REQ-36, REQ-37
- **Purpose:** view an item's details and stock per size; Admin can edit name, category, price, sizes offered, and photo (upload/replace/remove). Uploaded photos are automatically resized/compressed before saving (see `database-schema.md`), so no separate "resize your photo first" step is needed.
- **Elements (Admin only):** an "Adjust stock" action per size, which opens a small form for a quantity change and a required note (REQ-35); an "Archive" / "Restore" action at the item level and at the individual size level (REQ-36, REQ-37), with archived sizes/items clearly labeled as such rather than hidden from Admin's own view.

### 2.4 Item management list

- **Who:** Admin
- **Requirements:** REQ-1, REQ-36
- **Purpose:** list all items with an action to create a new one; entry point into item detail/edit (2.3). Includes a "show archived" toggle, since archived items are hidden by default.

### 2.4a Bulk initial stock entry

- **Who:** Admin
- **Requirements:** REQ-34
- **Purpose:** the main onboarding screen — enter starting on-hand quantities for every item/size in one place (a spreadsheet-style grid: one row per item/size, an editable quantity column) rather than opening each item individually. Saving records each as a manual stock adjustment, not a sale or stocktake discrepancy. Reusable later too, e.g. after adding a batch of brand-new items.

### 2.5 Record a sale

- **Who:** Admin, User
- **Requirements:** REQ-23, REQ-24
- **Purpose:** the main day-to-day screen for sales staff.
- **Elements:** a fast type-ahead search across the full item catalog (by name, not just browsing categories, since the catalog can run into the hundreds of item/size combinations), then select size(s), enter quantity per line, add multiple lines, submit. Shows a warning (not a block) if a line would take stock negative. On submit, logs the sale and decrements stock immediately.

### 2.6 Orders list

- **Who:** Admin
- **Requirements:** REQ-5
- **Purpose:** see all supplier orders with order number, supplier, date, and status; filter/search; entry point to create a new order or open an existing one.

### 2.7 Create order

- **Who:** Admin
- **Requirements:** REQ-3, REQ-4
- **Purpose:** start a new supplier order.
- **Elements:** supplier name field with autocomplete from previously used suppliers (or add new), order number, order date, and a repeatable line-item picker (item, size, quantity ordered).

### 2.8 Order detail

- **Who:** Admin
- **Requirements:** REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13
- **Purpose:** the hub for managing one order through its lifecycle.
- **Elements:** line items with quantity ordered vs. received so far; a status indicator showing the 5-stage sequence (Order Placed → Partially/Fully Received → Invoice Checked → Invoice Sent to Treasurer → Closed); buttons for the relevant next action (check in a delivery, mark invoice checked with optional note, mark invoice sent, close); a manual status override control that shows a confirmation warning before applying, since it bypasses the normal flow; delivery history for this order.

### 2.9 Check in a delivery

- **Who:** Admin
- **Requirements:** REQ-7, REQ-8
- **Purpose:** record what arrived against an order (possibly one of several partial deliveries).
- **Elements:** delivery date, and a quantity-received field per outstanding order line; submitting increases stock immediately and updates the order's received-vs-ordered totals and status.

### 2.10 Delivery history

- **Who:** Admin
- **Requirements:** REQ-9
- **Purpose:** view all deliveries for one order, and (as a separate view) a shop-wide delivery history across all orders.

### 2.11 Stocktakes list

- **Who:** Admin
- **Requirements:** REQ-18
- **Purpose:** list past stocktakes with date and scope (full/spot); entry point to start a new one or view a past one's results.

### 2.12 Start / enter a stocktake

- **Who:** Admin
- **Requirements:** REQ-15, REQ-16, REQ-17
- **Purpose:** perform a stocktake.
- **Elements:** choose date and scope (full, or a chosen subset of items/sizes for a spot stocktake); for each item/size in scope, show the system's expected quantity and a field to enter the counted quantity; on submit, the difference is calculated and shown per line, and stock is trued up to match the count.

### 2.13 Stocktake detail (past)

- **Who:** Admin
- **Requirements:** REQ-18
- **Purpose:** review a completed stocktake — date, scope, and each line's expected/counted/calculated-sold figures.

### 2.14 Sales reports

- **Who:** Admin, User
- **Requirements:** REQ-19, REQ-20, REQ-21, REQ-22
- **Purpose:** see units sold per item/size over a period.
- **Elements:** date-range picker with quick presets (this month/term/year, or custom range); view totals per item/size or a shop-wide summary; a CSV export button.

### 2.15 Roster calendar

- **Who:** Admin, User
- **Requirements:** REQ-26, REQ-27, REQ-28, REQ-31
- **Purpose:** the main roster screen.
- **Elements:** calendar view of upcoming opening-time slots; slots within a school holiday period are visually marked as closed and not claimable; open slots show a "claim" action (enter a name); claimed slots show the name and an "un-claim" action.

### 2.16 Opening-times setup

- **Who:** Admin
- **Requirements:** REQ-25, REQ-29
- **Purpose:** define/edit the recurring weekly pattern of opening times (day of week, start/end time); changes apply to future occurrences going forward.

### 2.17 School holidays setup

- **Who:** Admin
- **Requirements:** REQ-30, REQ-33
- **Purpose:** add/edit/delete school holiday date ranges (with an optional label); these suppress opening-time slots on the roster calendar for their dates.

### 2.18 Change password (hidden)

- **Who:** any logged-in user (Admin or User)
- **Requirements:** REQ-38
- **Purpose:** let a staff member change their own password, e.g. to replace the temporary one they were given at provisioning (section 4).
- **Elements:** current password, new password, confirm new password, "Change password" button, and a line showing which username is signed in. Success and error messages appear inline and the form stays on the page.
- **Not in the nav:** reached only by typing `/change-password` into the address bar, so a shared shop device doesn't advertise it. A signed-out visitor is sent to login and then straight back here.
- **Behaviour:** the current password is checked by signing in again with it before the update is sent, so a wrong current password is rejected with a clear message and the existing signed-in session is left untouched. Because that fresh sign-in happens seconds before the update, the page also satisfies Supabase's optional "Secure password change" setting without the emailed one-time code, which a synthetic address could never receive.

## 3. Open questions for this flow set

None outstanding — all three were resolved and folded in above and in section 4.

## 4. Staff login provisioning (no in-app screen)

There is deliberately no "manage users" screen. New staff logins are created manually by whoever administers the Supabase project, via the Supabase dashboard or a short script. Roughly:

1. Create the login in Supabase Authentication (dashboard: Authentication → Users → Add user; or the Supabase CLI/Admin API for a scriptable version), which creates a row in `auth.users` with a generated user id. Since staff log in with a username rather than a real email (2.1's login screen just asks for username + password), use a synthetic email of `<username>@<VITE_LOGIN_EMAIL_DOMAIN>` here — e.g. `jane@your-shop.login.local` — matching whatever domain the frontend is configured with (`.env`'s `VITE_LOGIN_EMAIL_DOMAIN`, see README). It's never a real, deliverable address; Supabase just requires the field to be syntactically valid.
2. Insert a matching row into the app's `profiles` table using that same id, setting `display_name` and `role` (`admin` or `user`):

   ```sql
   insert into profiles (id, display_name, role)
   values ('<auth-user-id-from-step-1>', 'Jane Smith', 'user');
   ```

3. Tell the staff member their username (the part before the `@`, e.g. `jane`) and temporary password outside the app — not the full synthetic email, which they never need to know or type. Once signed in they can replace the temporary password themselves at `/change-password` (2.18).

This is a one-off, low-frequency task (a handful of staff, added rarely), so a manual step-by-step process is a deliberate simplification rather than a gap — a proper "add staff" screen can be added later if turnover makes this annoying. A more polished version of this as a small runnable script belongs in an implementation/ops runbook once the Supabase project exists.

Supabase's own "forgot password" flow emails a reset link, which a synthetic address can never receive, so a forgotten password is also reset by hand. Whoever administers the Supabase project sets a new one with the Admin API (`auth.admin.updateUserById`), or from the dashboard's user page where that option is offered.

## 5. Change log

- **v0.6:** Added a hidden change-password page (2.18, REQ-38), reached by URL rather than from the menu, so staff can replace the temporary password from provisioning themselves. Section 1 and 2.1 point to it; section 4 now also covers resetting a forgotten password.
- **v0.5:** Login (2.1) now takes a plain username instead of an email address; staff never see the synthetic `<username>@`-domain address Supabase Auth actually uses under the hood. Updated the provisioning steps in section 4 to match.
- **v0.4:** Noted that photo uploads (2.3) are auto-compressed/resized on save, matching the move to in-database photo storage (ADR-001 Amendment 1).
- **v0.3:** Filled the initial-setup gap and added item lifecycle actions — a bulk initial stock-entry screen (2.4a, REQ-34), an "Adjust stock" action with a required note on item detail (REQ-35), and archive/restore actions at both the item and size level, plus a "show archived" toggle on the item list (REQ-36, REQ-37).
- **v0.2:** Resolved all three open questions from v0.1 — confirmed no in-app user management, with manual provisioning steps documented in section 4; sales screen (2.5) requires fast type-ahead search across the full catalog; order detail (2.8) shows a confirmation warning before applying a manual status override.
- **v0.1:** Initial draft.
