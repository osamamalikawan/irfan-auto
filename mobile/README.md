# Irfan Autos: Android app

A native Android shell (Capacitor) that opens the deployed Next.js site full screen.
Every web change goes live in the app on the next launch; no new APK is needed.

## Get an APK without installing anything (GitHub Actions)
1. Repo > Settings > Secrets and variables > Actions > Variables > **New repository variable**
   `APP_URL` = your Vercel URL (https, e.g. `https://irfan-auto.vercel.app`).
2. Repo > Actions > **Android APK** > Run workflow.
3. When it finishes, download `irfan-autos-debug-apk` from the run page, unzip, copy `app-debug.apk`
   to the phone and open it (allow "install unknown apps" once).

## Build locally (Android Studio, JDK 21)
```bash
cd mobile
npm install
export CAP_SERVER_URL=https://your-app.vercel.app     # Windows: set CAP_SERVER_URL=...
npx cap add android      # first time only
npm run open             # opens Android Studio; press Run
```
Emulator against your PC's dev server: `CAP_SERVER_URL=http://10.0.2.2:3000`.

## Notes
- The app needs the internet; if the site cannot be reached it shows a short "can't reach" page.
- The site must open without a Vercel login screen, or the app will show that screen.
- This is a debug build. A Play Store release needs a signed bundle (later).
- Commit the generated `mobile/android` folder after the first successful build if you want to customise icons or the manifest.
