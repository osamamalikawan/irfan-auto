# Irfan Autos: Inventory module (Next.js + Supabase, Vercel-ready)

Mobile-first stock screens. No users or login yet (that is a later module).

## 1. Database
1. Create a Supabase project.
2. The Oracle importer writes only to tables and columns that already exist; it does not create tables or apply migrations. Confirm the target Supabase schema contains the tables and legacy-ID columns used by the selected import.

Some migration filenames have duplicate version prefixes (`0016` and `0017`). Check the target Supabase migration history before using `supabase db push` or renaming any migration; a migration already applied remotely must keep its recorded version.

## 2. Run locally
```bash
npm install
cp .env.example .env.local     # fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AUTH_SECRET
npm run import                 # loads data/products_all_pages_1-106_1.xlsx
npm run import -- --replace    # same, but first deletes all existing products and stock
npm run dev                    # http://localhost:3000
```
`npm run import` is safe to re-run. It prints a summary and writes `import-report.txt` listing any rows whose
Rack/Location cells could not be paired unambiguously.

### Rack / Location columns (comma separated)
- one location: all racks go in it
- same count of locations and racks: paired by position (`Godown 1, Market` + `G1-03, M-02`)
- anything else: all racks go under the first location and the row is listed in `import-report.txt`
- racks with no location go to a location called `Main`
- the single `Stock` number goes to the product's first location as an opening-stock movement

## 3. Deploy to Vercel
Push to GitHub, import the repo in Vercel, add the same env vars (including `AUTH_SECRET`), deploy.

## Sign in
First sign-in: user **Admin**, PIN **1111**. The app makes you choose a new PIN straight away, so do this
right after the first deploy. Then open **Users & Roles** to add your staff. Five wrong PINs lock a user for
10 minutes (an administrator can unlock them).

## API (shared by web and the Android app)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/inventory/products?q=&filter=all\|low\|out\|norack&list=<id>&offset=&limit=` | paged list + `total` |
| POST | `/api/inventory/products` | create |
| GET / PATCH | `/api/inventory/products/:id` | detail with per-location stock, racks, history / edit |
| POST | `/api/inventory/products/:id/adjust` | `{location_id, type: receive\|issue\|adjust, qty, note}` |
| GET | `/api/inventory/meta` | lists, locations, companies, brands |

## Layout
- Phone and tablet (under 1024px): card list, bottom navigation, bottom-sheet stock changes.
- Desktop (1024px and up): dark side menu, top bar and the stock-by-location table from the original index.html.

## Settings
`/settings`: switch price lists on or off (hidden lists are left out of the Stock screen; nothing is deleted)
and add stock locations (name, type, number of racks, optional rack prefix; racks are numbered 01, 02, 03…).
The setting is shared by everyone until the Users module exists.

## Prices
CP is the **counter price** (selling price). It is stored in `products.cp` and shown on every stock row.

## Users, roles and permissions
Roles are lists of permissions (see `lib/permissions.ts`). Every API route checks them, and the screens hide
what a person may not use. A user can also be limited to certain locations.

## Build order for the rest of index.html
1. Inventory (done)  2. Users & Roles + sign-in (done)  3. Customers, Routes & Areas (done)  4. Sales and payments (done), then Returns, Dispatch vouchers
5. Payment vouchers, Expenses, Market purchases, Purchases & Suppliers, Accounts  6. Weekly planner, Route plans, Sales team, Dashboard
7. Synchronization and the remaining Settings

## Importing from the old Oracle system
See `docs/LEGACY_MAPPING.md`. To preview or import customers into the existing `customers` table:
```bash
npm run import:oracle -- path/to/dump.sql --customers-only
npm run import:oracle -- path/to/dump.sql --customers-only --apply
```
The first command is a preview. After importing master data, preview or import historical invoices, purchases, and payments:
```bash
npm run import:oracle:history -- path/to/dump.sql
npm run import:oracle:history -- path/to/dump.sql apply
npm run import:oracle:history -- path/to/dump.sql customer-payments-only apply
npm run import:oracle:history -- path/to/dump.sql customer-discounts-only apply
npm run import:oracle:history -- path/to/dump.sql sales-returns-only apply
npm run import:oracle:history -- path/to/dump.sql customer-phones-only
npm run import:oracle:history -- path/to/dump.sql customer-phones-only apply
npm run import:oracle:history -- path/to/dump.sql routes-only
npm run import:oracle:history -- path/to/dump.sql routes-only apply
npm run import:oracle:history -- path/to/dump.sql areas-only
npm run import:oracle:history -- path/to/dump.sql areas-only apply
npm run import:oracle:history -- path/to/dump.sql supplier-payments-only
npm run import:oracle:history -- path/to/dump.sql supplier-payments-only apply
```
The history importer is preview-only by default, idempotent, and does not change stock. Use `customer-discounts-only apply` to import Oracle `CASHD1` sale discounts as customer credits labeled "Sale Discount". Use `sales-returns-only apply` to import returns without reprocessing invoices or payments. Use `customer-phones-only` to preview and `customer-phones-only apply` to merge Oracle `CUST.CONTACT`, `CUST.PHONENO`, and `CUST2.MOBILE` into customer phone records without replacing existing numbers. Use `routes-only` to preview and `routes-only apply` to import Oracle `ROUTE` records and assign customers from `CUST.ROUTE`; existing manually assigned routes are preserved. Route salespeople are linked only if matching users have already been imported. Use `areas-only` to preview and `areas-only apply` to create the "No city" city, import every Oracle `CITY` row as an area beneath it, and assign customers from `CUST.CITYNO`, preserving manually assigned areas. Oracle supplier accounts share the `CUST` master with customers; use `supplier-payments-only` to preview and `supplier-payments-only apply` to reconcile supplier profiles from accounts referenced by `INV0P` or `CASHP1` and import supplier payments without reprocessing purchases or customer history. It requires the existing Supabase tables and master records to be present; see `docs/LEGACY_MAPPING.md` for included tables and known exclusions.

## Customers and routes
`/customers` (search, route and area filters, remarks, archive, move to another route) and `/routes` (routes with salesman,
visit days, areas and targets; cities and areas). A salesman whose role is "own customers only" sees just the customers on
his own routes. Opening balance and credit limit are stored now; the customer statement arrives with Sales.

## Sales
`/sales` lists invoices (today, week, month, all) and collects payments. `/sales/new` builds an invoice: pick a customer
(or the walk-in cash customer), add parts by name, code, Urdu name or rack, and save. Saving is one database step
(`create_sale`): stock is taken from the location sold from first (Settings > Stock locations), buy+free schemes add
free pieces, brand and customer discounts apply by default, and the customer's balance and payment are recorded
together. A cancelled invoice puts the stock back and reverses the ledger. Changing prices or discounts needs the
`sales.discount` permission; cancelling needs `sales.cancel`.

## Returns, dispatch, expenses and vouchers
- `/returns`: find an invoice, choose the quantities that come back. The customer is credited, goods go back to the location
  they came from (unless marked damaged), and the walk-in cash customer is refunded as an expense. An invoice with returns
  cannot be cancelled.
- `/dispatch`: warehouse pick vouchers (no prices) for the thermal roll or A4 sheets; remembers what was printed.
- `/expenses`: money paid out by category; remove a wrong entry. Refunds from returns appear here automatically.
- `/vouchers`: received vouchers (RV-, customer payments) and paid vouchers (PV-, expenses), each printable.

## Suppliers, purchases and accounts
- `/suppliers`: supplier list and profile with what we owe, a statement, recent purchases, and **Pay supplier** (cash, bank or cheque).
- `/purchases`: record goods received. Stock goes up at the chosen location (including free bonus pieces), the supplier's account is
  credited, and the last price paid is remembered for each part. Cancelling takes the goods out again, but only if they are still there.
- `/accounts`: sales, purchases, money in and out, what customers owe and what we owe, biggest balances and a daily money book.
- New permissions (Users & Roles > Roles): suppliers.view/edit/pay, purchases.create/cancel. Administrators have them already; give them to other roles as needed.

## Monthly planner
Every route is **weekly**, **fortnightly** or **monthly**, with visit days (Mon-Sat):
- weekly: every week on its visit days
- fortnightly: every second week, counted from the week of a chosen date
- monthly: the 1st, 2nd, 3rd, 4th or last occurrence of each visit day in the month

`/planner` shows the month as a calendar (dots on phone, route names on desktop), the day you tap with its routes and customers,
visit recording for today (outcome + note), every route's schedule with "Edit", and a list of what the plan does not cover
(routes without a salesman or visit days, areas on no route, customers without a route). The rules live in `lib/schedule.ts`.

## Route plans and customer responses
- `/route-plans` lists every planned visit of every route (from the monthly schedule) as Planned, Overdue or Completed. **Mark completed** asks for the
  fuel cost, which is recorded in Expenses as Fuel. Reopening a completed route cancels that expense. The Completed tab shows visited / planned,
  productive visits, sales, collections and fuel as a share of sales.
- `/route-plans/<route>/<date>` is the plan for one run: every customer with what they owe, their last response, and a form to
  **record the customer's response** (outcome, notes, and an optional promise to pay with date and amount). Responses can be entered
  for today or up to 31 days back. **Print** gives a sheet for the salesman with a blank response column.
- A customer's profile now shows their recent visit responses.

## Sales Team and Dashboard
- `/team`: sales, collections and visits against targets, per **salesman**, **route** or **area**, for today, this week, this month or any dates.
  Monthly targets are pro-rated by days (days / 30). Sales are net of returns and exclude bilti; collections are payments received.
  Targets are set on a salesman (Users & Roles, or the Targets button) or on a route (the Targets button). An area has no target of its own: each route's
  target is shared between the areas on it. Colours: red below 70%, green from 100% (change them in Settings > Target colours).
- `/dashboard` is the home page for everyone and shows only what the role may see: today's sales and collections, what customers owe, money in hand,
  visits left today, targets this month, low stock and the latest invoices.

## Customer groups, phones and invoice rules (0022)
- **Groups**: any number per customer (Archive, Dead, Defaulter, Closed are created for you; add more in the customer form). Filter the Customers list by group.
- **Mobile numbers**: add as many as needed in the customer form. The first two are also kept in `customers.phone` / `phone2` for the Android app.
- **Invoice rules** (checked in `create_sale`, for credit invoices): the invoice must fit the remaining credit limit, and the customer must have no invoice unpaid for more than their *invoice days limit* (default 30; only an administrator can change it; 0 turns the day check off). Payments and returns are applied to the oldest invoices first (`customer_overdue()`).

## Retail price (0023)
- Products have **CP** (ledger sales) and **RP** (retail / counter sales). Edit them on the product form, the Products page or the product edit window.
- New invoice: counter sale starts on RP, ledger sale on CP. The RP / CP switch (F8 on the desktop screen) changes the price for items without a typed price. If a part has no price of the chosen type, the other one is used.
- `create_sale` / `edit_sale` take an optional `price_type` per line. Choosing a product's RP or CP never needs the "change prices" permission.
- Products page: select products, then "Change company / brand / supplier…" (suppliers can be added, replaced or removed) or "Move to list…".
- Printed invoices show the Urdu name with the brand in ( ).

## Products page, suppliers and purchase orders (0022)
- `/products`: products of active price lists only, with company, brand and suppliers; search, filters, edit, and "Move to list" (an inactive list takes the product off the page).
- A product can have several suppliers (edit product, or the supplier's **Products** tab). Suppliers already used in purchases are linked automatically by the migration.
- Supplier page tabs: **Overview**, **Products**, **Purchase orders** (pick products, quantities and rates, then print / save as PDF).
