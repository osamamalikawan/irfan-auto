# Irfan Autos: Salesman Android app

Kotlin + Jetpack Compose. Talks to the same website/API as the office (`/api/...`), so there is nothing else to host.

## What it does
- **Works without internet.** Everything the salesman needs is on the phone: his customers with balances and account statements, the full parts list,
  payment methods, delivered invoices for returns, and his visit plan for the next 7 days. It is downloaded automatically whenever there is internet and
  is updated again the moment the internet comes back.
- **Start / End work**: saved on the phone at once with the real time (place and time are shown to the office under *Field Team > Attendance*).
- **Live location**: while on duty a foreground service saves his position every 2 minutes (using both Google's location and the phone's own GPS) and sends it to the office
  (*Live map*). Without internet the positions are kept on the phone; the moment internet returns they are sent and his current position is reported straight away.
- **Visit plan**: today's routes and customers, a progress bar, the outcome of each visit, his **remarks** and a promise-to-pay (date and amount); the last visit's remarks
  are shown at each customer. Next days can be previewed.
- **Customers**: balances, unpaid bills, account statement, call button. Tap any invoice (in the statement or the unpaid list) to open it with its lines, totals and payments.
  **Full ledger** shows every entry of a period with the running balance.
- **Tasks**: scheduled order actions, customers' promises to pay, and his own tasks (add one, tick it off). Works offline.
- **My ledger**: every payment he collected and every handover to the office, with the running balance.
- **New order**, **Collect payment**, **Return / claim** (also directly from an invoice; an invoice that cannot be returned says why): saved on the phone and sent to the office for approval (*Field Team > Approvals*). Nothing can be sent twice.
- **Requests**: everything waiting to be sent, and the status of everything sent (waiting / approved / rejected with the office's reason).
- **My account**: sales, collections and visits against target; money still to hand over to the office; what customers owe.
- **Location warnings**: if location is switched off or the permission is removed while on duty, a red warning appears, the notification turns red, and the office is told.
- **Keypad sign-in** (and keypad PIN change). Signing in needs internet once; after that the app opens and works offline.

## Set the website address (once)
Open `app/src/main/java/pk/irfanautos/salesman/Config.kt` and replace `PUT-YOUR-WEBSITE-ADDRESS-HERE` with your website address,
for example `https://irfan-auto.vercel.app` (only the address, no page name after it). On GitHub you can do this in the browser:
open the file, click the pencil icon, edit the one line, commit.

## Get the APK (no Android Studio needed)
1. Push this repo to GitHub (the `salesman-app/` folder and `.github/workflows/salesman-apk.yml`). Pushing a change inside `salesman-app/` builds the APK by itself.
2. GitHub > **Actions** > *Salesman Android APK* (you can also press **Run workflow**).
3. When it turns green, open the run and download **irfan-salesman-apk** (a zip containing `app-debug.apk`).
4. Send the APK to the salesman's phone (WhatsApp, USB, Drive) and open it. Android asks to allow *Install unknown apps* for that app: allow it.

Or with Android Studio: open the `salesman-app` folder, let it sync, press Run.

## First use on the phone
1. Open the app, choose your name, enter the PIN.
2. If the office gave a temporary PIN you are asked to choose your own.
3. On the home screen tap **Start work** and **allow location**. Choose **Allow / Unrestricted** when asked about battery, so tracking keeps working with the screen off.
4. Keep GPS (location) switched on while working.

## Before it works, on the server
- Run migrations `0016_field_work.sql` and `0018_salesman_account.sql` in Supabase and deploy the latest website.
- Give each salesman the **Salesman** role (it gets the app permissions from 0016) and put his customers on his routes.
- Only after testing: run `0021_salesman_approval_switch.sql` so salesmen can no longer invoice directly on the website.

## Notes
- Needs Android 8.0 or newer and Google Play services (for location).
- Debug-signed APK: fine for your own staff. For the Play Store you would make a release build with your own keystore.
- Signing in (the first time, or after signing out) needs internet. Everything else works offline.
- Where things are: `data/` (server calls, offline queue, sync), `location/` (GPS + background service), `ui/` (screens).
