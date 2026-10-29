"use client";
import { useCallback, useEffect, useState } from "react";
import { DAYS } from "@/lib/days";
import { rs } from "@/lib/format";
import Toast from "./Toast";

type Area = { id: string; name: string; customers: number; route_ids: string[] };
type City = { id: string; name: string; areas: Area[] };
type Route = {
  id: string; name: string; code: string | null; salesman_id: string | null; list_id: string | null; visit_days: string[]; fuel_cost: number;
  target_sales: number; target_collection: number; target_visits: number; customers: number;
  salesman: { id: string; name: string } | null; areas: { id: string; name: string; city: { id: string; name: string } | null }[];
};
type Salesman = { id: string; name: string };

const overlay = "fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center";
const panel = "mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4";

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true as const } : { ok: false as const, error: (j.error as string) || "Could not save" };
}

export default function RoutesView() {
  const [tab, setTab] = useState<"routes" | "areas">("routes");
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [editR, setEditR] = useState<Route | "new" | null>(null);
  const [addCity, setAddCity] = useState(false);
  const [addArea, setAddArea] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [r, g] = await Promise.all([fetch("/api/routes"), fetch("/api/geo")]);
    const [rj, gj] = await Promise.all([r.json(), g.json()]);
    if (!r.ok) return setError(rj.error || "Could not load routes");
    if (!g.ok) return setError(gj.error || "Could not load areas");
    setRoutes(rj.routes); setSalesmen(rj.salesmen ?? []); setCities(gj.cities);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/inventory/meta").then((r) => r.json()).then((j) => setLists(j.lists ?? [])).catch(() => {}); }, []);

  const routeName = (id: string) => routes?.find((r) => r.id === id)?.name ?? "?";
  const byCity = (r: Route) => {
    const m = new Map<string, string[]>();
    for (const a of r.areas) { const k = a.city?.name ?? "No city"; m.set(k, [...(m.get(k) ?? []), a.name]); }
    return [...m].map(([c, as]) => c + ": " + as.join(", ")).join(" · ");
  };

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 lg:hidden"><h1 className="text-lg font-bold">Routes &amp; Areas</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={"chip " + (tab === "routes" ? "chip-on" : "")} onClick={() => setTab("routes")}>Routes</button>
          <button className={"chip " + (tab === "areas" ? "chip-on" : "")} onClick={() => setTab("areas")}>Cities &amp; areas</button>
          <div className="flex-1" />
          {tab === "routes" ? <button className="btn btn-primary min-h-9" onClick={() => setEditR("new")}>Add route</button> : (
            <>
              <button className="btn min-h-9" onClick={() => setAddCity(true)}>Add city</button>
              <button className="btn btn-primary min-h-9" onClick={() => setAddArea(true)}>Add area</button>
            </>
          )}
        </div>
      </header>

      <div className="p-3 lg:p-5">
        {error && <p className="mb-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!routes && !error && <p className="text-sm text-muted">Loading…</p>}

        {tab === "routes" && routes && (
          <>
            {!routes.length && <p className="text-sm text-muted">No routes yet. Add cities and areas, then a route.</p>}
            <ul className="grid gap-2 lg:grid-cols-2">
              {routes.map((r) => (
                <li key={r.id} className="card p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{r.name} {r.code && <span className="text-xs font-normal text-muted">{r.code}</span>}</p>
                      <p className="text-sm">{r.salesman ? r.salesman.name : <span className="pill bg-red-bg text-red">No salesman</span>}</p>
                    </div>
                    <button className="btn min-h-9 px-3" onClick={() => setEditR(r)}>Edit</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.visit_days.length ? r.visit_days.map((d) => <span key={d} className="pill bg-green-bg text-green">{d}</span>) : <span className="pill bg-amber-bg text-amber">No visit day</span>}
                    <span className="pill bg-bg text-muted">{r.customers} customers</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">{byCity(r) || "No areas yet"}</p>
                  {(r.target_sales > 0 || r.target_collection > 0 || r.target_visits > 0 || r.fuel_cost > 0) && (
                    <p className="mt-1 text-xs text-muted">Monthly: {rs(r.target_sales)} sales · {rs(r.target_collection)} collection · {r.target_visits} visits{r.fuel_cost ? " · " + rs(r.fuel_cost) + " fuel per run" : ""}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "areas" && (
          <div className="grid gap-2 lg:grid-cols-2">
            {!cities.length && routes && <p className="text-sm text-muted">No cities yet. Add one first.</p>}
            {cities.map((c) => (
              <section key={c.id} className="card p-3">
                <h2 className="mb-1 font-semibold">{c.name}</h2>
                {!c.areas.length && <p className="text-sm text-muted">No areas yet</p>}
                <ul className="divide-y divide-line">
                  {c.areas.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{a.name}</span>
                        <span className="block text-xs text-muted">{a.route_ids.length ? a.route_ids.map(routeName).join(", ") : ""}</span>
                      </span>
                      {!a.route_ids.length && <span className="pill bg-red-bg text-red">Not in any route</span>}
                      <span className="w-16 text-right text-xs text-muted">{a.customers} cust.</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {editR && <RouteForm route={editR === "new" ? null : editR} salesmen={salesmen} cities={cities} lists={lists} onClose={() => setEditR(null)}
        onSaved={(m) => { setEditR(null); setToast(m); load(); }} />}
      {addCity && <NameModal title="Add city" label="City name" onClose={() => setAddCity(false)}
        onSave={(name) => send("/api/geo", "POST", { type: "city", name })} onDone={() => { setAddCity(false); setToast("City added"); load(); }} />}
      {addArea && <NameModal title="Add area" label="Area name" cities={cities} onClose={() => setAddArea(false)}
        onSave={(name, cityId) => send("/api/geo", "POST", { type: "area", name, city_id: cityId })} onDone={() => { setAddArea(false); setToast("Area added"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function NameModal({ title, label, cities, onClose, onSave, onDone }: {
  title: string; label: string; cities?: City[]; onClose: () => void;
  onSave: (name: string, cityId: string) => Promise<{ ok: true } | { ok: false; error: string }>; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState(cities?.[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await onSave(name, cityId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone();
  }
  return (
    <div className={overlay} onClick={onClose}>
      <form onSubmit={go} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} className={panel + " lg:max-w-sm"}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {cities && (
          <div className="mb-3">
            <label className="label" htmlFor="nm-city">City</label>
            <select id="nm-city" className="input" value={cityId} onChange={(e) => setCityId(e.target.value)}>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <label className="label" htmlFor="nm-name">{label}</label>
        <input id="nm-name" className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || (!!cities && !cityId)}>{busy ? "Saving…" : "Add"}</button>
        </div>
      </form>
    </div>
  );
}

function RouteForm({ route, salesmen, cities, lists, onClose, onSaved }: {
  route: Route | null; salesmen: Salesman[]; cities: City[]; lists: { id: string; name: string }[]; onClose: () => void; onSaved: (m: string) => void;
}) {
  const [name, setName] = useState(route?.name ?? "");
  const [code, setCode] = useState(route?.code ?? "");
  const [salesman, setSalesman] = useState(route?.salesman_id ?? "");
  const [list, setList] = useState(route?.list_id ?? "");
  const [days, setDays] = useState<string[]>(route?.visit_days ?? []);
  const [areaIds, setAreaIds] = useState<string[]>(route?.areas.map((a) => a.id) ?? []);
  const [fuel, setFuel] = useState(route?.fuel_cost ? String(route.fuel_cost) : "");
  const [tS, setTS] = useState(route?.target_sales ? String(route.target_sales) : "");
  const [tC, setTC] = useState(route?.target_collection ? String(route.target_collection) : "");
  const [tV, setTV] = useState(route?.target_visits ? String(route.target_visits) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body = { name, code, salesman_id: salesman || null, list_id: list || null, visit_days: days, area_ids: areaIds, fuel_cost: fuel, target_sales: tS, target_collection: tC, target_visits: tV };
    const r = route ? await send("/api/routes/" + route.id, "PATCH", body) : await send("/api/routes", "POST", body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(route ? "Saved" : name + " added");
  }

  return (
    <div className={overlay} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={route ? "Edit route" : "Add route"} className={panel}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">{route ? "Edit route" : "Add route"}</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className="label" htmlFor="rt-name">Route name</label><input id="rt-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label" htmlFor="rt-code">Code</label><input id="rt-code" className="input" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          </div>
          <div>
            <label className="label" htmlFor="rt-sm">Salesman</label>
            <select id="rt-sm" className="input" value={salesman} onChange={(e) => setSalesman(e.target.value)}>
              <option value="">No salesman yet</option>
              {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {!salesmen.length && <p className="mt-1 text-xs text-muted">No salesmen yet. Mark a user as a salesman in Users &amp; Roles.</p>}
          </div>
          {lists.length > 0 && (
            <div>
              <label className="label" htmlFor="rt-list">Sells from price list</label>
              <select id="rt-list" className="input" value={list} onChange={(e) => setList(e.target.value)}>
                <option value="">Any</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <fieldset>
            <legend className="label">Visit days</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d} type="button" aria-pressed={days.includes(d)} className={"chip " + (days.includes(d) ? "chip-on" : "")} onClick={() => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}>{d}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Areas on this route</legend>
            {!cities.length && <p className="text-sm text-muted">Add cities and areas first.</p>}
            {cities.map((c) => (
              <div key={c.id} className="mb-2">
                <p className="text-sm font-semibold">{c.name}</p>
                <div className="grid grid-cols-2 gap-x-2">
                  {c.areas.map((a) => (
                    <label key={a.id} className="flex min-h-10 items-center gap-2 text-sm">
                      <input type="checkbox" className="size-5" checked={areaIds.includes(a.id)} onChange={(e) => setAreaIds((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} /> {a.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="rt-ts">Sales target / month (Rs)</label><input id="rt-ts" className="input" type="number" inputMode="decimal" min="0" value={tS} onChange={(e) => setTS(e.target.value)} /></div>
            <div><label className="label" htmlFor="rt-tc">Collection / month (Rs)</label><input id="rt-tc" className="input" type="number" inputMode="decimal" min="0" value={tC} onChange={(e) => setTC(e.target.value)} /></div>
            <div><label className="label" htmlFor="rt-tv">Visits / month</label><input id="rt-tv" className="input" type="number" inputMode="numeric" min="0" value={tV} onChange={(e) => setTV(e.target.value)} /></div>
            <div><label className="label" htmlFor="rt-fuel">Fuel cost per run (Rs)</label><input id="rt-fuel" className="input" type="number" inputMode="numeric" min="0" value={fuel} onChange={(e) => setFuel(e.target.value)} /></div>
          </div>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
