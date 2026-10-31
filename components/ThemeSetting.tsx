"use client";
import { useEffect, useState } from "react";
import { THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme";

const OPTIONS: { key: Theme; label: string; note: string; swatch: [string, string, string] }[] = [
  { key: "light", label: "Light", note: "Blue and white", swatch: ["#eef4ff", "#ffffff", "#1f5fd6"] },
  { key: "dark", label: "Dark", note: "Easier on the eyes at night", swatch: ["#0e151c", "#17212b", "#3cb5ad"] },
  { key: "system", label: "Match device", note: "Follows your phone or computer", swatch: ["#eef4ff", "#17212b", "#1f5fd6"] },
];

/** Light / dark / match device. Applies at once and is remembered on this device (cookie), so the page loads in the right theme. */
export default function ThemeSetting() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => { setTheme(parseTheme(document.documentElement.dataset.theme)); }, []);

  function pick(t: Theme) {
    setTheme(t);
    const el = document.documentElement;
    if (t === "system") delete el.dataset.theme; else el.dataset.theme = t;
    document.cookie = THEME_COOKIE + "=" + t + "; path=/; max-age=31536000; samesite=lax" + (location.protocol === "https:" ? "; secure" : "");
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={theme === o.key} onClick={() => pick(o.key)}
          className={"flex items-center gap-3 rounded-xl border p-3 text-left active:opacity-70 " + (theme === o.key ? "border-accent ring-2 ring-accent" : "border-line")}>
          <span className="flex h-10 w-12 shrink-0 overflow-hidden rounded-lg border border-line" aria-hidden>
            <span className="flex-1" style={{ background: o.swatch[0] }} />
            <span className="flex-1" style={{ background: o.swatch[1] }} />
            <span className="w-2.5" style={{ background: o.swatch[2] }} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{o.label}{theme === o.key ? " ✓" : ""}</span>
            <span className="block text-xs text-muted">{o.note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
