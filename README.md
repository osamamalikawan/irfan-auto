# Irfan Autos: Inventory module (Next.js + Supabase, Vercel-ready)

Mobile-first stock screens. No users or login yet (that is a later module).

## 1. Database
1. Create a Supabase project.
2. SQL Editor: run, in order, `0001_inventory.sql`, `0002_settings.sql` (list visibility, CP rename), `0003_search.sql` (word-by-word search) and `0004_users_roles.sql` (users, roles, PIN login) `0006_customers_routes.sql` (customers, cities, areas, routes) `0007_sales.sql` (invoices, payments, customer balances) `0008_returns_money.sql` (returns, expenses, vouchers, dispatch) `0009_purchases_suppliers.sql` (suppliers, purchases, supplier payments, accounts) `0010_planner.sql` (route types, visits) and `0011_route_plans.sql` (completed routes, promises to pay). `0005_legacy_ids.sql` is only needed for the old-system import.

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
See `docs/LEGACY_MAPPING.md`. Run `0005_legacy_ids.sql` first, then:
```bash
npm run import:oracle -- path/to/dump.sql            # preview only
npm run import:oracle -- path/to/dump.sql --apply    # write to the database
```

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
