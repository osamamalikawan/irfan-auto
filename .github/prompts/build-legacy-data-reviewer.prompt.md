---
name: "Build Legacy Data Reviewer"
description: "Build a secure Next.js workspace to visually review Oracle legacy data and explicitly import approved records into this app."
argument-hint: "Optional: specify which legacy datasets or review screens to prioritize."
agent: "agent"
---

Build a polished, working Next.js data-review workflow in this repository so an administrator can inspect Oracle dump records, correct or approve mappings, and explicitly import selected data into the existing app.

## Start with repository evidence

- Inspect the current Next.js app structure, authentication and permissions, Supabase server helpers, migrations, UI conventions, and import code before designing the implementation.
- Reuse existing domain mappings and idempotency behavior from [the Oracle history importer](../../scripts/import-oracle-history.ts), [the Oracle dump parser](../../lib/oracle-dump.ts), and [the legacy mapping guide](../../docs/LEGACY_MAPPING.md). Do not assume a dedicated supplier table exists in the source: customer and supplier accounts share the Oracle `CUST` master, and transaction references determine whether an account is used as a supplier.
- Treat the existing app and its database as the destination. Do not create a second production schema or silently replace existing customer, supplier, route, area, product, or ledger records.

## Workflow requirements

1. Provide an authenticated, permission-checked import workspace with dataset navigation for customers, suppliers, routes/areas, products, purchases, customer receipts, supplier payments, returns, and discounts where the source tables and destination mappings support them.
2. Let an authorized user provide the Oracle dump and select a dataset. Parse and validate it server-side. The dump may be very large; stream it and paginate/filter on the server instead of loading the whole file or every row into browser memory.
3. Show a review table with search, filters, pagination, source identifiers, mapped destination identity, validation state, and actionable warnings. Let reviewers inspect individual records, compare source values with existing destination data, edit supported mapping fields, and include/exclude records or mark them reviewed.
4. Make joins visible and correctable. Examples include `CUST.CCODE` to customer/supplier records, `CUST.ROUTE` to `ROUTE.ROUTEID`, `CUST.CITYNO` to `CITY.CITYNO`, invoice-to-line references, and product/location references. Display missing, ambiguous, duplicate, and conflicting references instead of guessing silently.
5. Provide an explicit preview step showing selected/importable/skipped counts and consequential field changes. Require a deliberate confirmation before writes. Never auto-apply after upload, preview, or review.
6. Import only reviewed, valid, selected records. Show progress, per-batch results, errors, and a resumable/idempotent outcome. A failed batch must not be reported as a successful full import.
7. Preserve shared Oracle accounts: an account may appear as both a customer and a supplier. Keep customer and supplier destination records distinct, link each to the same Oracle code when appropriate, and never infer supplier identity solely from `CUST.CODE='S'`.

## Safety and implementation constraints

- Use the app's established server-side auth and authorization patterns. Restrict import, review, and apply actions to an appropriate administrator/import permission.
- Keep Supabase service credentials and all privileged database writes on the server. Never put secrets in client bundles, query strings, logs, or generated files.
- Validate file size/type, parsed table/column shapes, row values, identifiers, and every destination relation. Do not execute SQL from the uploaded dump; parse supported Oracle `INSERT` statements as data only.
- Do not log full customer, supplier, payment, credential, or phone records. Do not commit uploaded dumps, secrets, or sensitive review data.
- For temporary staging, use an ownership-aware, expiring server-side mechanism and clean up uploads/staging after completion or expiry. Do not put an entire import in browser storage.
- Use deterministic source keys and the app's existing idempotency patterns. Make partial failures visible and safely retryable. If multi-table import ordering or atomicity cannot be guaranteed with existing infrastructure, explain and implement a safe staged sequence rather than pretending it is transactional.
- Keep source values and reviewer overrides distinguishable. Preserve an audit trail of who approved/applied a batch and which rows were changed, using existing audit conventions where available.
- Follow the repository's existing design system and responsive patterns. Include empty, loading, validation-error, permission-denied, apply-progress, and partial-failure states.
- Make only changes needed for this workflow. Add/update directly related documentation and tests. Do not actually apply a live import as part of building the UI.

## Completion

Implement the end-to-end workflow, run the smallest relevant tests plus type-check/build as appropriate, and report the changed files, verification results, and any destination mappings that still require human review.
