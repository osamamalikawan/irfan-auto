"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { activeHref, visibleMenu } from "@/lib/menu";
import { useMe } from "./Me";

const digit = (e: KeyboardEvent) => { const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); return m ? Number(m[1]) : 0; };

/**
 * Desktop top bar with drop-down menus (lg and up; phones use the bottom bar).
 * Keys: Alt+1..9 opens a menu, then 1..9 opens that item, arrows move, Esc closes.
 */
export default function TopNav() {
  const path = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const { user } = useMe();
  const groups = useMemo(() => visibleMenu(user), [user]);
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const focusFirst = useRef(false);

  useEffect(() => { setOpen(null); }, [path, search]);

  const links = (i: number) => Array.from(root.current?.querySelectorAll<HTMLAnchorElement>('[data-menu="' + i + '"] a') ?? []);

  useEffect(() => {
    if (open === null || !focusFirst.current) return;
    focusFirst.current = false;
    links(open)[0]?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = digit(e);
      if (e.altKey && !e.ctrlKey && !e.metaKey && n && groups[n - 1]) {
        e.preventDefault();
        focusFirst.current = true;
        setOpen((o) => (o === n - 1 ? null : n - 1));
        return;
      }
      if (open === null) return;
      if (e.key === "Escape") { setOpen(null); root.current?.querySelector<HTMLButtonElement>('[data-top="' + open + '"]')?.focus(); return; }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const items = links(open);
      if (n && items[n - 1]) { e.preventDefault(); items[n - 1].click(); return; }
      const at = items.indexOf(document.activeElement as HTMLAnchorElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(at <= 0 ? items.length : at) - 1]?.focus(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        focusFirst.current = true;
        setOpen((open + (e.key === "ArrowRight" ? 1 : groups.length - 1)) % groups.length);
      }
    }
    function onDown(e: MouseEvent) { if (open !== null && !root.current?.contains(e.target as Node)) setOpen(null); }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open, groups]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  return (
    <nav ref={root} aria-label="Main menu" data-noprint className="sticky top-0 z-40 hidden h-12 items-center gap-1 bg-side px-3 text-side-ink lg:flex">
      <Link href="/" className="mr-3 shrink-0 text-[15px] font-bold leading-none text-white">Irfan Autos</Link>
      {groups.map((g, i) => {
        const cur = activeHref(g, path, params);
        const isOpen = open === i;
        return (
          <div key={g.label} className="relative" data-menu={i} onMouseEnter={() => open !== null && setOpen(i)}>
            <button type="button" data-top={i} aria-haspopup="menu" aria-expanded={isOpen} title={"Alt+" + (i + 1)}
              onClick={() => { focusFirst.current = false; setOpen(isOpen ? null : i); }}
              className={"flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm " + (cur ? "bg-accent font-semibold text-accent-ink" : isOpen ? "bg-white/15 text-white" : "hover:bg-white/10")}>
              <span className="text-[11px] opacity-60" aria-hidden>{i + 1}</span>{g.label}<span className="text-[10px]" aria-hidden>▾</span>
            </button>
            {isOpen && (
              <div role="menu" aria-label={g.label} className="absolute left-0 top-full z-50 mt-1 min-w-56 rounded-xl border border-line bg-surface p-1 text-ink shadow-lg">
                {g.items.map((it, j) => (
                  <Link key={it.href} href={it.href} role="menuitem" aria-current={cur === it.href ? "page" : undefined} onClick={() => setOpen(null)}
                    className={"flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none hover:bg-bg focus:bg-bg " + (cur === it.href ? "font-semibold text-accent" : "")}>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded border border-line text-[11px] text-muted" aria-hidden>{j + 1}</span>
                    {it.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Link href="/account" className={"rounded-md px-2.5 py-1 text-right leading-tight hover:bg-white/10 " + (path.startsWith("/account") ? "bg-white/10" : "")}>
          <span className="block text-sm font-semibold text-white">{user.name}</span>
          <span className="block text-[11px]">{user.roleName}</span>
        </Link>
        <button type="button" className="h-9 rounded-md px-2.5 text-sm hover:bg-white/10" onClick={signOut}>Sign out</button>
      </div>
    </nav>
  );
}
