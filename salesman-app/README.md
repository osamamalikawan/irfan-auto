# Irfan Autos: Salesman Android app

Kotlin + Jetpack Compose. Talks to the same website/API as the office (`/api/...`), so there is nothing else to host.

## What it does
- **Start / End work**: saves the salesman's place and time (office sees it under *Field Team > Attendance*).
- **Live location**: while on duty a foreground service sends his position every 2 minutes (office: *Field Team > Live map*).
  Points taken without internet are kept on the phone and uploaded later.
- **Customers**: his own customers with balances, full account statement, unpaid bills.
- **New order** (temporary invoice), **Collect payment**, **Return / claim**: sent to the office for approval
  (*Field Team > Approvals*). Nothing reaches stock or the customer account until the office approves.
  Without internet the request is saved on the phone and sent automatically; it can never be sent twice.
- **My requests**: status of everything sent (waiting / approved / rejected with the office's reason); withdraw a waiting one.
- **My account**: sales, collections, visits against target; money still to hand over to the office; what customers owe.

## Get the APK (no Android Studio needed)
1. Push this repo to GitHub (the `salesman-app/` folder and `.github/workflows/salesman-apk.yml`).
2. GitHub > **Actions** > *Salesman Android APK* > **Run workflow** (type your website address, e.g. `https://irfan-auto.vercel.app`, or leave blank and type it in the app).
3. When it turns green, open the run and download **irfan-salesman-apk** (a zip containing `app-debug.apk`).
4. Send the APK to the salesman's phone (WhatsApp, USB, Drive) and open it. Android asks to allow *Install unknown apps* for that app: allow it.

Or with Android Studio: open the `salesman-app` folder, let it sync, press Run. To set the website address at build time:
`gradle assembleDebug -PSERVER_URL=https://your-site.vercel.app`.

## First use on the phone
1. Open the app, type the website address, tap **Load names**, choose the name, enter the PIN.
2. If the office gave a temporary PIN you are asked to choose your own.
3. On the home screen tap **Start work** and **allow location**. Choose **Allow / Unrestricted** when asked about battery, so tracking keeps working with the screen off.
4. Keep GPS (location) switched on while working.

## Before it works, on the server
- Run migrations `0016_field_work.sql` and `0018_salesman_account.sql` in Supabase and deploy the latest website.
- Give each salesman the **Salesman** role (it gets the app permissions from 0016) and put his customers on his routes.
- Only after testing: run `0017_salesman_approval_switch.sql` so salesmen can no longer invoice directly on the website.

## Notes
- Needs Android 8.0 or newer and Google Play services (for location).
- Debug-signed APK: fine for your own staff. For the Play Store you would make a release build with your own keystore.
- Starting and ending work needs internet (it is recorded on the server at that moment). Everything else can be queued offline.
- Where things are: `data/` (server calls, offline queue, sync), `location/` (GPS + background service), `ui/` (screens).
