import type { Metadata, Viewport } from "next";
import { Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";

const urdu = Noto_Nastaliq_Urdu({ subsets: ["arabic"], variable: "--font-urdu", display: "swap" });

export const metadata: Metadata = {
  title: "Irfan Autos",
  description: "Bike & auto spare parts: inventory",
  appleWebApp: { capable: true, title: "Irfan Autos" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0e6b66" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={urdu.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
