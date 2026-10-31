import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

const urdu = Noto_Nastaliq_Urdu({ subsets: ["arabic"], variable: "--font-urdu", display: "swap" });

export const metadata: Metadata = {
  title: "Irfan Autos",
  description: "Bike & auto spare parts: inventory",
  appleWebApp: { capable: true, title: "Irfan Autos" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1f5fd6" }, { media: "(prefers-color-scheme: dark)", color: "#0a1117" }] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={urdu.variable} data-theme={theme === "system" ? undefined : theme}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
