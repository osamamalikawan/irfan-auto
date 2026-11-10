# Old Oracle system -> this app

Source: Oracle tables supplied as separate SQL files in `data/` (77 tables). Rows marked "my reading" are guesses from column
names and sample data; confirm them against the old screens.

## 1. Imported by `npm run import:oracle`

Customers must be imported before dependent sales records. The importer does not create tables or apply migrations;
it writes only to existing Supabase tables. Preview and import customer rows into the existing `customers` table:

```bash
npm run import:oracle -- data
npm run import:oracle -- data apply users
npm run import:oracle:history -- data routes-only
npm run import:oracle:history -- data routes-only apply
npm run import:oracle:history -- data areas-only
npm run import:oracle:history -- data areas-only apply
npm run import:oracle:history -- data customer-phones-only
npm run import:oracle:history -- data customer-phones-only apply
npm run import:oracle:history -- data apply
npm run import:oracle:history -- data customer-discounts-only
npm run import:oracle:history -- data customer-discounts-only apply
```

The customer stage imports `CUST` rows with `CODE = 'C'`, keyed idempotently by `CCODE` in the existing `ora_ccode`
column. New customer codes use the distinct `ORA-C-<CCODE>` namespace so they cannot collide with app-generated
`C-####` codes; existing customer codes are preserved on re-runs. It maps the core profile, credit terms, active status, and opening balance to existing customer columns and
syncs `COBAL` as an opening entry in `customer_ledger`. Apply the Supabase migrations, including
`supabase/migrations/0007_sales.sql`, before importing; the importer stops before writing if the ledger table is
missing. It also ensures the required `WALK-IN` customer exists. This imports opening balances only, not historical invoices or payments. `CUST2` mobile numbers are imported
by `customer-phones-only apply`, merged with `CUST.CONTACT`,
`CUST.PHONENO`, and existing customer phone records. Existing numbers are retained, and the `customer_phones` relation
plus `customers.phone`, `phone2`, and `phone_search` are synchronized.

The importers map only supported application data; they do not execute the SQL files or copy unsupported tables
raw. In particular, Oracle passwords, push tokens, session/security data, audit logs, and binary attachments are
not imported. `data/` must contain the table files referenced by the selected import scope.

After importing master data, `import:oracle:history` previews or imports `INV0S` / `INV1S` customer invoices,
`INV0P` / `INV1P` purchases, `INVR0` / `INVR1` sales returns, `CASHR1` customer receipts, and `CASHP1` supplier payments. Customer and supplier identities share the Oracle `CUST` account table; a record can be used in both roles. Supplier records are matched or created from accounts referenced by purchase/payment transactions, not by requiring `CUST.CODE = 'S'`. The history importer is idempotent and inserts rows
directly without replaying stock movements. Transactions with missing customers, locations, products, or item rows
are skipped and reported. Line totals are reconstructed from `QTY * UPRICE` less line discounts and the header
discount percentage. Legacy invoice flags are retained in the remarks rather than translated into cancelled status.
`CASH_REC0` supplies dates for customer entries in `CASH_REC1`; receipt-sheet entries matching `CASHR1` by customer,
date, and amount are deduplicated. Use `customer-payments-only apply` to import only `CASHR1` and unmatched customer
receipt-sheet entries without reprocessing invoices. Use `sales-returns-only apply` to import returns without
reprocessing other history. Since the legacy return headers do not reliably identify an original invoice, only
returns with a unique customer, product, date, and quantity match are linked to an invoice in `sale_returns`;
unmatched or ambiguous returns are recorded as customer-ledger credits instead of being attached to a guessed sale.
Use `customer-discounts-only apply` to import `CASHD1` sale discounts as customer credits labeled "Sale Discount". Use `customer-phones-only` to preview Oracle customer phone coverage and `customer-phones-only apply` to import it.
Use `routes-only` to preview and `routes-only apply` to import `ROUTE` and assign customers from `CUST.ROUTE`. Duplicate route names are disambiguated by appending their Oracle route ID; existing non-Oracle customer route assignments are preserved. Salespeople are assigned only when a matching `app_users.ora_collectorid` exists. Use `areas-only` to preview and `areas-only apply` to create a "No city" parent, import all `CITY` rows as areas under it, and assign customers from `CUST.CITYNO`. Duplicate area names are disambiguated by their Oracle city number; a row without a source name is imported as `Unnamed area [CITYNO]`. Existing non-Oracle customer area assignments are preserved. The `ADDA` transport depot mapping is not changed by these imports.
Use `supplier-payments-only` to preview and `supplier-payments-only apply` to import/reconcile supplier accounts from mixed `CUST` records referenced by `INV0P` or `CASHP1`, and import only the supplier payment rows and ledger entries. This scope is idempotent and does not reprocess purchases or customer history.
`INV0S.RETURN2 = 'Y'` also marks 479 invoice rows in this dump as returned/claimed; these are imported as return or
claim records linked to their own legacy invoice, with customer credits that offset the imported invoice total.
`INV0P.RETURN2 = 'Y'` marks additional historical return vouchers stored with purchase rows. Rows whose `CCODE`
maps to an imported customer are imported as customer-ledger return credits with their original item details in the
note; they are not linked to a sale invoice or replayed as stock movements.

Non-customer cash reconciliation data and supplier opening balances are not imported.

| Old table.column | Becomes | Notes |
|---|---|---|
| CUST where CODE = 'C' | `customers` | `CCODE` -> `ora_ccode`; `CNAME`, contacts, credit fields, `ACTIVE`, and `COBAL` are imported. GODOWN records and other `CODE` values are excluded from customer records. |
| CUST referenced by INV0P / CASHP1 | `suppliers` | `CCODE` -> `ora_ccode`; shared account data is used for supplier records when referenced as a supplier, regardless of `CUST.CODE`. Godowns are excluded. A CUST account may exist as both a customer and supplier. |
| CAT (CATID, CATNAME) | `price_lists` | "IRFAN AUTO SHOP LIST", "SAZ FIX PARTS LIST", ... same lists as the Excel file |
| DEPT (DEPTID, DEPTNAME) | `companies` | my reading |
| GEN (GENID, GENNAME, DEPTID) | `brands` (company = its DEPT) | my reading |
| CUST where GODOWN = 'Y' | `locations` (type Godown) | e.g. CCODE 2 "HEAD OFFICE"; invoices refer to godowns by GCCODE |
| PROD.PCODE | `products.ora_pcode` | old product code used to link imported invoices and purchases |
| PROD.CPNAME / PNAME | `name_en` / `code_name` | PNAME is cut off at 60 characters, CPNAME is the full name (switch with `--name=PNAME`) |
| PROD.PNAMEURDU | `name_ur` | |
| PROD.CATID / GENID | list / brand / company | |
| PROD.BQTY + GQTY | `scheme` "buy+free" | only when both are above 0 (9+1) |
| PROD.SRATELOSE | `cp` (counter price) | my reading. Other candidates: RATEA/B/C (`--cp=RATEA`) |
| PROD.REQTY | `reorder_level` | my reading (`--reorder=MAXQTY` or `none`) |
| PROD.ACTIVE = 'N' | `active = false` | hidden from the Stock screen |
| PROD.INHAND | opening stock at the first godown | negative values are skipped and reported |
| PROD.OP, RATEA/B/C, SRATEPACK, LOSEINPACK, DISCB, SCODE, CCODE, ... | `products.legacy` (JSON) | kept so nothing is lost; sales and purchase modules will use them |
| COLLECTOR (with `--users`) | `app_users` (role Salesman) | created with an unknown PIN; set a PIN in Users & Roles. Old passwords (PW) are never imported |
| INV0S / INV1S | `sales` / `sale_items` | `INVNO` -> `OLD-<INVNO>`; customer from `CCODE`; item quantity, price, and discounts from `QTY`, `UPRICE`, and `DISC` |
| INV0P / INV1P | `purchases` / `purchase_items` | supplier from `CCODE`, receiving location from `GCCODE`; item quantities and costs from `QTY` and `UPRICE`; `RETURN2 = 'Y'` rows mapped to customers are imported as historical ledger-only customer returns |
| CASHR1 | `payments` / `customer_ledger` | customer receipts, keyed idempotently by `CASHNO` |
| CASH_REC0 / CASH_REC1 | `payments` / `customer_ledger` | customer receipts only; split amount columns are summed and matches to CASHR1 are skipped |
| CASHP1 | `supplier_payments` / `supplier_ledger` | supplier payments, keyed idempotently by `CASHNO` |
| CASHD1 | `customer_ledger` | sale discounts are customer credits (`amount < 0`) labeled "Sale Discount", keyed idempotently by `CASHNO` |
| INVR0 / INVR1 | `sale_returns` / `sale_return_lines` / `customer_ledger` | return totals are credited to the customer ledger; only unambiguously linked original invoices appear as sale returns |
| ROUTE | `routes` | `ROUTEID` -> `ora_routeid`; `ROUTENAME` -> name; `CATID` -> price list; `COLLECTORID` links only to an already imported user |
| CUST.ROUTE | `customers.route_id` | Customer-to-route assignment; manually assigned routes not managed by this import are preserved |
| CITY | `areas` | `CITYNO` is retained in a deterministic area ID; each area belongs to the synthetic city "No city" |
| CUST.CITYNO | `customers.area_id` | Customer-to-area assignment; manual area assignments outside this Oracle import are preserved |

## 2. Still not imported (mapping needs verification)

| Old tables | New module |
|---|---|
| PROMISE, DEALER, DISC, DISCHEAD0/1 | Customer extras (promise-to-pay dates, dealer price tiers and discounts) |
| ADDA | Transport depot (adda = transport depot used on invoices) |
| COLLECTOR (COMM, ROUTES_ALLOWED), TAR0/TAR1 | Sales Team and targets |
| Remaining CASH_REC0/1 data, CASH_DIS0/1 | Collector cash reconciliation and discounts (not imported) |
| CASHE1, CASHW1, CASHZ1, CASHS, CASHI, CASHOB | Expenses, write-offs, opening balance |
| BANK, INST, INSTALL, CHECKS, VOUCHERS | Banks, instruments, instalments, cheque and voucher number ranges |
| PROD1 (barcodes), PROD12 (conversions), PROD0/PROD2/PROD3 (matching products to an "original" name) | Inventory extras |
| MAN0/01/1/11/2/21 | Repacking / manufacturing (my reading) |
| ROLES, MENU_AUTH | Permissions (old role levels map to this app's roles by hand) |

## 3. Not imported
AUDIT_TBL, MYAUDIT, MYAUDIT_LOG, MYAUDIT_OST, FCM_LOG, FCM_QUEUE, MESSAGEIN, MESSAGELOG, MESSAGEOUT, NEWS_BULLETIN,
OWNER_2FA, USR_GPS_HEARTBEAT, USR_LOGIN_SESSIONS, KPOS, LOCAL_VCUSTHIST, TALLY, RANGE, SERIAL, DATED, CODES.
(SMS/WhatsApp/push logs, old logins and sessions, audit trails, printer settings.)
