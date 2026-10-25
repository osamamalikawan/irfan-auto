import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app is a native shell around the deployed Next.js site.
 * Set CAP_SERVER_URL to your Vercel URL, e.g. https://irfan-auto.vercel.app
 * (for the emulator talking to `npm run dev` on your PC use http://10.0.2.2:3000).
 */
const url = process.env.CAP_SERVER_URL;
if (!url) throw new Error("Set CAP_SERVER_URL to the deployed site URL before running cap commands.");

const config: CapacitorConfig = {
  appId: "pk.irfanautos.stock",
  appName: "Irfan Autos",
  webDir: "www",
  server: { url, cleartext: url.startsWith("http://"), errorPath: "offline.html" },
  android: { allowMixedContent: false },
};

export default config;
