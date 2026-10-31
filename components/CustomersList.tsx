"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { rs } from "@/lib/format";
import { telLink } from "@/lib/phone";
import { canAddCustomer } from "@/lib/permissions";
import { useMe } from "./Me";
import Toast from "./Toast";

type Customer = {
  id: string; code: string; name: string; name_ur: string | null; owner: string | null; phone: string | null; credit_limit: number; balance: number; last_remark: string | null;
  area: { id: string; name: string; city: { name: string } | null } | null;
  route: { id: string; name: string; visit_days: string[]; salesman: { id: string; name: string } | null } | null;
};
type Route = { id: string; name: string; salesman: { name: string } | null };
type City = { id: string; name: string; areas: { id: string; name: string }[] };
const PAGE = 30;

export default function CustomersList() {
  const { can, user } = useMe();
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const [area, setArea] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [toast, setToast] = useState("");
  const req = useRef(0);

  useEffect(() => {
    fetch("/api/routes").then((r) => r.json()).then((j) => setRoutes(j.routes ?? [])).catch(() => {});
    fetch("/api/geo").then((r) => r.json()).then((j) => setCities(j.cities ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    const p = new URLSearchParams({ q, status, offset: String(offset), limit: String(PAGE) });
    if (route) p.set("route", route);
    if (area) p.set("area", area);
    try {
      const r = await fetch("/api/customers?" + p);
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load customers");
      setItems((prev) => (offset ? [...prev, ...j.items] : j.items));
      setTotal(j.total);
    } catch (e) {
      if (id === req.current) setError((e as Error).message);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [q, status, route, area]);

  useEffect(() => {
    const t = setTimeout(() => { setSel(new Set()); load(0); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const canSelect = can("routes.manage") && status === "active";

  const dayText = (c: Customer) => c.route?.visit_days?.length ? c.route.visit_days.join(", ") : "";
  const place = (c: Customer) => [c.area?.name, c.area?.city?.name].filter(Boolean).join(", ");

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pb-0 lg:pt-4">
        <div className="mb-2 flex items-baseline justify-between lg:hidden">
          <h1 className="text-lg font-bold leading-tight">Customers</h1>
          <span className="text-xs text-muted">{loading && !items.length ? "Loading…" : total.toLocaleString() + (status === "archived" ? " archived" : " customers")}</span>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {canAddCustomer(user) && status === "active" && <Link href="/customers/new" className="btn btn-primary hidden lg:order-1 lg:inline-flex">Add customer</Link>}
          {canSelect && <button className="btn hidden lg:order-2 lg:inline-flex" disabled={!sel.size} onClick={() => setMoving(true)}>Move selected to route ({sel.size})</button>}
          <div className="relative order-1 w-full lg:order-4 lg:flex-1">
            <input className="input pr-10" type="text" inputMode="search" enterKeyHint="search" placeholder="Search name, phone, owner or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
            {q && <button type="button" className="btn absolute inset-y-0 right-1 min-h-9 border-0 bg-transparent px-2" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
          </div>
          <div className="order-2 grid grid-cols-2 gap-2 lg:order-3 lg:flex">
            <select className="input lg:w-44" value={route} onChange={(e) => setRoute(e.target.value)} aria-label="Route">
              <option value="">All routes</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select className="input lg:w-52" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
              <option value="">All areas</option>
              {cities.map((c) => <optgroup key={c.id} label={c.name}>{c.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
            </select>
          </div>
        </div>
        <div className="mt-2 flex gap-2 lg:mt-3">
          <button className={"chip " + (status === "active" ? "chip-on" : "")} onClick={() => setStatus("active")}>Active</button>
          <button className={"chip " + (status === "archived" ? "chip-on" : "")} onClick={() => setStatus("archived")}>Archived</button>
        </div>
      </header>

      {status === "archived" && <p className="mx-3 mt-2 rounded-lg bg-amber-bg p-2 text-sm text-amber lg:mx-5">Archived customers keep their history. They stay out of invoices and route plans until made active again.</p>}

      {/* phone: cards */}
      <ul className="space-y-2 p-3 lg:hidden">
        {items.map((c) => (
          <li key={c.id} className="card p-3">
            <Link href={"/customers/" + c.id} className="block active:opacity-70">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 font-semibold leading-snug">{c.name}</p>
                <span className="shrink-0 text-xs text-muted">{c.code}</span>
              </div>
              {c.name_ur && <p className="ur text-sm text-muted">{c.name_ur}</p>}
              <p className="text-sm text-muted">{[c.owner, place(c)].filter(Boolean).join(" · ")}</p>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                {c.route ? <span className="pill bg-bg text-muted">{c.route.name}{dayText(c) ? " · " + dayText(c) : ""}</span> : <span className="pill bg-red-bg text-red">No route</span>}
                {c.balance > 0 && <span className="pill bg-red-bg text-red">Due {rs(c.balance)}</span>}
                {c.credit_limit > 0 && <span className="pill bg-bg text-muted">Limit {rs(c.credit_limit)}</span>}
              </div>
              {c.last_remark && <p className="mt-1 truncate text-xs italic text-muted">“{c.last_remark}”</p>}
            </Link>
            {telLink(c.phone) && <a href={telLink(c.phone)!} className="btn mt-2 min-h-9 w-full justify-start gap-2 text-sm">📞 {c.phone}</a>}
          </li>
        ))}
      </ul>

      {/* desktop: table like the original screen */}
      <section className="card mx-5 mt-3 hidden p-3.5 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[12.5px] text-muted">
                <th className="w-8 border-b border-line px-2 py-1.5" />
                <th className="border-b border-line px-2 py-1.5 font-semibold">Code</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Customer</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Area / route</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Salesman</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Visit day</th>
                <th className="border-b border-line px-2 py-1.5 text-right font-semibold">Balance</th>
                <th className="border-b border-line px-2 py-1.5 text-right font-semibold">Credit limit</th>
                <th className="border-b border-line px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-bg">
                  <td className="border-b border-line px-2 py-2">{canSelect && <input type="checkbox" className="size-4" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={"Select " + c.name} />}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-muted">{c.code}</td>
                  <td className="border-b border-line px-2 py-2">
                    <Link href={"/customers/" + c.id} className="font-semibold hover:underline">{c.name}</Link>
                    {c.name_ur && <div className="ur text-[13px] leading-8 text-muted">{c.name_ur}</div>}
                    <div className="text-xs text-muted">{[c.owner, c.phone].filter(Boolean).join(" · ")}</div>
                    {c.last_remark && <div className="max-w-xs truncate text-xs italic text-muted" title={c.last_remark}>“{c.last_remark}”</div>}
                  </td>
                  <td className="border-b border-line px-2 py-2">
                    {place(c) || "—"}
                    <div className="text-xs">{c.route ? <span className="text-muted">{c.route.name}{c.route.visit_days.length ? "" : " · no visit day"}</span> : <span className="pill bg-red-bg text-red">Not in any route</span>}</div>
                  </td>
                  <td className="border-b border-line px-2 py-2">{c.route?.salesman?.name ?? "—"}</td>
                  <td className="border-b border-line px-2 py-2">{dayText(c) || "—"}</td>
                  <td className={"whitespace-nowrap border-b border-line px-2 py-2 text-right " + (c.balance > 0 ? "font-semibold text-red" : "")}>{c.balance ? rs(c.balance) : "—"}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{c.credit_limit > 0 ? rs(c.credit_limit) : "—"}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">
                    <Link href={"/customers/" + c.id} className="btn min-h-8 px-2 text-[13px]">Open</Link>{" "}
                    {can("customers.edit") && <Link href={"/customers/" + c.id + "/edit"} className="btn min-h-8 px-2 text-[13px]">Edit</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">{total.toLocaleString()} {status === "archived" ? "archived customers" : "customers"}</p>
      </section>

      <div className="px-3 pb-6 text-center text-sm text-muted lg:px-5 lg:pt-3">
        {error && <p className="mb-2 text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p>No customers match these filters.</p>}
        {items.length < total && (
          <button className="btn w-full lg:w-auto" disabled={loading} onClick={() => load(items.length)}>
            {loading ? "Loading…" : "Load more (" + (total - items.length).toLocaleString() + " left)"}
          </button>
        )}
      </div>

      {canAddCustomer(user) && status === "active" && (
        <Link href="/customers/new" aria-label="Add customer"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-accent text-3xl text-accent-ink shadow-lg active:opacity-80 lg:hidden">＋</Link>
      )}

      {moving && <MoveModal ids={[...sel]} routes={routes} onClose={() => setMoving(false)} onDone={(n) => { setMoving(false); setSel(new Set()); setToast(n + " customer(s) moved"); load(0); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

export function MoveModal({ ids, routes, onClose, onDone }: { ids: string[]; routes: Route[]; onClose: () => void; onDone: (n: number) => void }) {
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = routes.find((r) => r.id === routeId);
  async function go() {
    setBusy(true); setError("");
    const r = await fetch("/api/customers/reassign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, route_id: routeId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not move");
    onDone(j.moved ?? 0);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Move to route" onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">Move {ids.length} customer{ids.length === 1 ? "" : "s"} to another route</h2>
        <label className="label" htmlFor="mv-route">New route</label>
        <select id="mv-route" className="input" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <p className="mt-2 text-sm text-muted">Salesman: <b className="text-ink">{target?.salesman?.name ?? "none yet"}</b>. Past invoices and payments keep their original salesman and route.</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !routeId} onClick={go}>{busy ? "Moving…" : "Move"}</button>
        </div>
      </div>
    </div>
  );
}
