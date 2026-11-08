# Old Oracle system -> this app

Source: `combined_outputs.sql` (full Oracle dump; 77 tables). Rows marked "my reading" are guesses from column
names and sample data; confirm them against the old screens.

## 1. Imported by `npm run import:oracle`

Customers must be imported before dependent sales records. The importer does not create tables or apply migrations;
it writes only to existing Supabase tables. Preview and import customer rows into the existing `customers` table:

```bash
npm run import:oracle -- path/to/dump.sql --customers-only
npm run import:oracle -- path/to/dump.sql --customers-only --apply
```

The customer stage imports `CUST` rows with `CODE = 'C'`, keyed idempotently by `CCODE` in the existing `ora_ccode`
column. It maps the core profile, credit terms, active status, and opening balance to existing customer columns and
syncs `COBAL` as an opening entry in `customer_ledger`. Apply the Supabase migrations, including
`supabase/migrations/0007_sales.sql`, before importing; the importer stops before writing if the ledger table is
missing. This imports opening balances only, not historical invoices or payments. City/route assignments and extra
`CUST2` phone rows are deferred until their mappings are verified.

| Old table.column | Becomes | Notes |
|---|---|---|
| CUST where CODE = 'C' | `customers` | `CCODE` -> `ora_ccode`; `CNAME`, contacts, credit fields, `ACTIVE`, and `COBAL` are imported. GODOWN records and other `CODE` values are excluded. |
| CAT (CATID, CATNAME) | `price_lists` | "IRFAN AUTO SHOP LIST", "SAZ FIX PARTS LIST", ... same lists as the Excel file |
| DEPT (DEPTID, DEPTNAME) | `companies` | my reading |
| GEN (GENID, GENNAME, DEPTID) | `brands` (company = its DEPT) | my reading |
| CUST where GODOWN = 'Y' | `locations` (type Godown) | e.g. CCODE 2 "HEAD OFFICE"; invoices refer to godowns by GCCODE |
| PROD.PCODE | `products.ora_pcode` | old product code, kept for linking invoices later |
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

## 2. For the next modules (need the full table export)

| Old tables | New module |
|---|---|
| CUST2, PROMISE, DEALER, DISC, DISCHEAD0/1 | Customer extras (additional phones, promise-to-pay dates, dealer price tiers and discounts) |
| CITY, ROUTE (ROUTEID, COLLECTORID, CATID), ADDA | Routes & Areas (adda = transport depot used on invoices) |
| COLLECTOR (COMM, ROUTES_ALLOWED), TAR0/TAR1 | Sales Team and targets |
| INV0S / INV1S | Sales invoices (header, lines; BQTY/GQTY = scheme, QTYTYPE 'L' = loose piece) |
| INVR0 / INVR1 | Sales returns (my reading) |
| INV0P / INV1P | Purchases (supplier = CUST by CCODE) |
| CASHR1, CASH_REC0/1, CASH_DIS0/1 | Payments received and collector cash sheets |
| CASHP1, CASHE1, CASHD1, CASHW1, CASHZ1, CASHS, CASHI, CASHOB | Supplier payments, expenses, discounts, write-offs, opening balance |
| BANK, INST, INSTALL, CHECKS, VOUCHERS | Banks, instruments, instalments, cheque and voucher number ranges |
| PROD1 (barcodes), PROD12 (conversions), PROD0/PROD2/PROD3 (matching products to an "original" name) | Inventory extras |
| MAN0/01/1/11/2/21 | Repacking / manufacturing (my reading) |
| ROLES, MENU_AUTH | Permissions (old role levels map to this app's roles by hand) |

## 3. Not imported
AUDIT_TBL, MYAUDIT, MYAUDIT_LOG, MYAUDIT_OST, FCM_LOG, FCM_QUEUE, MESSAGEIN, MESSAGELOG, MESSAGEOUT, NEWS_BULLETIN,
OWNER_2FA, USR_GPS_HEARTBEAT, USR_LOGIN_SESSIONS, KPOS, LOCAL_VCUSTHIST, TALLY, RANGE, SERIAL, DATED, CODES.
(SMS/WhatsApp/push logs, old logins and sessions, audit trails, printer settings.)
