# Field-work API (Salesman Android app and office screens)

All routes are JSON. Errors are `{ "error": "message" }` (401 sign in again, 403 no permission, 409 business rule, e.g. "Not enough stock").

## Sign in from the app
`GET /api/auth/users` -> `{ users: [{ id, name }] }` (the name list)
`POST /api/auth/login` `{ userId, pin, client: "app" }` -> `{ ok, mustChangePin, token }`
Send `Authorization: Bearer <token>` on every call. The token lasts 30 days; a deactivated user is locked out at once.
If `mustChangePin` is true: `POST /api/auth/pin` `{ current, next }` first, other routes answer 403 until then.
`GET /api/auth/me` -> `{ user }` (permissions, `isSalesman`, `ownOnly`).

## Attendance and location (permission `attendance.mark`)
| Call | Purpose |
|---|---|
| `GET /api/attendance/today` | `{ attendance \| null, on_duty }` for the Start / End work button |
| `POST /api/attendance` `{ lat, lng, accuracy? }` | start work (saves place and time). Tapping again while on duty changes nothing; after an end-of-day it resumes the shift |
| `POST /api/attendance/check-out` `{ lat, lng, accuracy? }` | end work |
| `POST /api/location` `{ pings: [{ lat, lng, accuracy?, ts, battery? }] }` | up to 200 points per call (`ts` = ISO text or epoch ms). Answer `{ accepted, ignored, on_duty }`; **stop tracking when `on_duty` is false**. Points outside a checked-in shift are ignored. Re-sending the same point is harmless |

## Reading (salesman: only his own routes' customers)
`GET /api/customers?q=&offset=&limit=` customers; `GET /api/customers/:id` profile; `GET /api/customers/:id/ledger?from=&to=` statement, balance and unpaid bills
`GET /api/inventory/products?q=&offset=&limit=` parts; `GET /api/payment-methods` methods for payments
`GET /api/sales?customer=<id>` that customer's invoices; `GET /api/sales/:id/returnable` what can still be returned from an invoice

## The salesman's own account (needs `0018_salesman_account.sql`)
`GET /api/me/account?range=today|week|month|custom&from=&to=` (default this month) ->
- `performance`: `sales`, `collection`, `visits`, each `{ target, actual, remaining, pct, status, label }` (same figures as the office Team screen)
- `cash`: `{ opening, collected, handed_over, closing, entries: [{ ts, entry_date, type: "collection"|"handover", customer_name, method, note, amount, balance }] }`. `closing` is the money he still has to account for: everything he collected minus what the office recorded as received
- `receivable`: `{ total, customers }` what his customers owe; `pending`: `{ orders, payments, returns, total }` his requests waiting for approval

`GET /api/me/customers?q=&owing=1&sort=balance` -> `{ items: [{ id, code, name, phone, credit_limit, area, route, balance }], count, total_owing }` his customers with balances; open one with `GET /api/customers/:id/ledger` for the full statement.

## Requests (salesman files, office approves)
Nothing changes stock or the ledger until the office approves. Send an `idem_key` (a new UUID per request, reused on retry) so an offline retry never creates a second request; a repeat answers `{ ..., duplicate: true }`.

| Call | Body |
|---|---|
| `POST /api/requests/orders` | `{ customer_id, lines: [{ product_id, qty }], term?: "cash"\|"credit", bilti?, local_charges?, remarks?, lat?, lng?, idem_key }` (temporary invoice) |
| `POST /api/requests/payments` | `{ customer_id, amount, method_id, note?, lat?, lng?, idem_key }` |
| `POST /api/requests/returns` | `{ sale_id, lines: [{ item_id, qty }], kind?: "return"\|"claim", damaged?, reason?, lat?, lng?, idem_key }` |
| `GET /api/requests/:type?status=&offset=&limit=` | the salesman's own requests (`status`: pending, approved, rejected, cancelled, all). Rejected ones carry `review_note` |
| `GET /api/requests/:type/:id` | one request |
| `POST /api/requests/:type/:id/cancel` | withdraw his own pending request |

`:type` is `orders`, `payments` or `returns`. Created: `201 { id, no, status, created_at }`.

## Office (permission `requests.approve`, `attendance.view`, `tracking.view`)
| Call | Purpose |
|---|---|
| `GET /api/requests/summary` | `{ orders, payments, returns, total }` waiting, for a badge |
| `GET /api/requests/:type?status=pending&salesman=` | the queue (everyone's) |
| `POST /api/requests/orders/:id/approve` | `{ lines?, discount?, bilti?, local_charges?, remarks? }` -> creates a normal Active invoice; `{ ok, sale_id }`. Send `lines` only if the office edited them |
| `POST /api/requests/payments/:id/approve` | `{ amount?, method_id? }` -> goes into the customer ledger; `{ ok, payment_id }` |
| `POST /api/requests/returns/:id/approve` | `{ lines?, damaged? }` -> stock back, customer credited; `{ ok, return_id }` |
| `POST /api/requests/:type/:id/reject` | `{ note }` (required; the salesman sees it) |
| `GET /api/attendance?from=&to=&user=` | attendance with place and time (a salesman gets only his own rows). The office also gets `salesmen` (everyone who should be working), to show who has not started |
| `GET /api/tracking` | every salesman's last position, battery, on-duty, `recorded_at` |
| `GET /api/tracking/:userId?date=` | that day's trail |
| `GET /api/handovers` (`accounts.edit`) | every salesman: `{ user_id, name, collected, handed_over, balance }` |
| `GET /api/handovers?user=<id>&range=` | one salesman's cash statement |
| `POST /api/handovers` | `{ user_id, amount, method_id?, note?, date? }` the office received money from him; cannot exceed what he holds |
| `POST /api/handovers/:id/void` | cancel a wrong entry |

Approving twice returns the same result and changes nothing. If stock or the customer balance no longer allows it, the approve call answers 409 with the reason and the request stays pending.

## Go-live checklist
1. Run `0016_field_work.sql` and `0018_salesman_account.sql` (add tables, functions and the new permissions; nothing existing changes). The salesman cash account counts from the day you run 0018 (`app_users.cash_start`).
2. Test with the Android app and the approval screens.
3. Run `0017_salesman_approval_switch.sql` to stop salesmen creating invoices/payments directly.
