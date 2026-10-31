"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "./Me";
import { Loading, Spinner } from "./Loading";

type City = { id: string; name: string; areas: { id: string; name: string }[] };

export default function CustomerForm({ id }: { id?: string }) {
  const router = useRouter();
  const { can } = useMe();
  const full = can("customers.edit"); // salesmen add customers to their own routes only, without credit terms
  const [cities, setCities] = useState<City[]>([]);
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({ name: "", name_ur: "", owner: "", phone: "", phone2: "", address: "", cnic: "", ntn: "", email: "", credit_limit: "", credit_days: "", area_id: "", route_id: "", opening_balance: "", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    fetch("/api/geo").then((r) => r.json()).then((j) => setCities(j.cities ?? [])).catch(() => {});
    if (!id) fetch("/api/routes").then((r) => r.json()).then((j) => setRoutes(j.routes ?? [])).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!id) return;
    fetch("/api/customers/" + id).then((r) => r.json()).then((d) => {
      if (d.error) return setError(d.error);
      const c = d.customer;
      setF((s) => ({ ...s, name: c.name ?? "", name_ur: c.name_ur ?? "", owner: c.owner ?? "", phone: c.phone ?? "", phone2: c.phone2 ?? "", address: c.address ?? "", cnic: c.cnic ?? "", ntn: c.ntn ?? "", email: c.email ?? "",
        credit_limit: Number(c.credit_limit) ? String(c.credit_limit) : "", credit_days: Number(c.credit_days) ? String(c.credit_days) : "", area_id: c.area?.id ?? c.area_id ?? "" }));
      setLoaded(true);
    }).catch(() => setError("Could not load"));
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body: Record<string, unknown> = { ...f };
    if (id) { delete body.route_id; delete body.opening_balance; delete body.remarks; }
    const r = await fetch(id ? "/api/customers/" + id : "/api/customers", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    router.replace("/customers/" + (id ?? j.id));
    router.refresh();
  }

  const L = (label: string, htmlFor: string, input: React.ReactNode) => (<div><label className="label" htmlFor={htmlFor}>{label}</label>{input}</div>);
  return (
    <form onSubmit={save} className="lg:max-w-3xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href={id ? "/customers/" + id : "/customers"} className="btn border-0 bg-transparent px-3 text-xl" aria-label="Cancel">←</Link>
        <h1 className="flex-1 text-base font-bold">{id ? "Edit customer" : "New customer"}</h1>
        <button className="btn btn-primary" disabled={busy || !loaded || !f.name.trim() || (!id && !full && !f.route_id)}>{busy ? <><Spinner /> Saving…</> : "Save"}</button>
      </header>

      <div className="space-y-4 p-3 lg:px-5">
        {!loaded && !error && <Loading />}
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <section className="card space-y-3 p-4">
          {L("Business name *", "c-name", <input id="c-name" className="input" required value={f.name} onChange={set("name")} />)}
          {L("Business name (Urdu)", "c-ur", <input id="c-ur" className="input ur" dir="rtl" value={f.name_ur} onChange={set("name_ur")} />)}
          <div className="grid grid-cols-2 gap-3">
            {L("Owner", "c-owner", <input id="c-owner" className="input" value={f.owner} onChange={set("owner")} />)}
            {L("Phone", "c-phone", <input id="c-phone" className="input" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} />)}
            {L("Second phone", "c-phone2", <input id="c-phone2" className="input" type="tel" inputMode="tel" value={f.phone2} onChange={set("phone2")} />)}
            {L("Email", "c-email", <input id="c-email" className="input" type="email" value={f.email} onChange={set("email")} />)}
          </div>
          {L("Address", "c-addr", <textarea id="c-addr" className="input min-h-16 py-2" rows={2} value={f.address} onChange={set("address")} />)}
          <div className="grid grid-cols-2 gap-3">
            {L("CNIC", "c-cnic", <input id="c-cnic" className="input" inputMode="numeric" value={f.cnic} onChange={set("cnic")} />)}
            {L("NTN", "c-ntn", <input id="c-ntn" className="input" value={f.ntn} onChange={set("ntn")} />)}
          </div>
        </section>

        <section className="card space-y-3 p-4">
          {L("City › area", "c-area", (
            <select id="c-area" className="input" value={f.area_id} onChange={set("area_id")}>
              <option value="">No area</option>
              {cities.map((c) => <optgroup key={c.id} label={c.name}>{c.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
            </select>
          ))}
          {!id && L(full ? "Route" : "Route *", "c-route", (
            <select id="c-route" className="input" required={!full} value={f.route_id} onChange={set("route_id")}>
              <option value="">{full ? "No route" : "Choose a route"}</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ))}
          {full && <div className="grid grid-cols-2 gap-3">
            {L("Credit limit (Rs)", "c-limit", <input id="c-limit" className="input" type="number" inputMode="decimal" min="0" value={f.credit_limit} onChange={set("credit_limit")} />)}
            {L("Credit days", "c-days", <input id="c-days" className="input" type="number" inputMode="numeric" min="0" value={f.credit_days} onChange={set("credit_days")} />)}
            {!id && L("Opening balance (Rs)", "c-open", <input id="c-open" className="input" type="number" inputMode="decimal" value={f.opening_balance} onChange={set("opening_balance")} />)}
          </div>}
          {!id && L("Remarks (optional)", "c-rem", <textarea id="c-rem" className="input min-h-16 py-2" rows={2} maxLength={500} placeholder="e.g. pays on Fridays, call before visiting" value={f.remarks} onChange={set("remarks")} />)}
        </section>
      </div>
    </form>
  );
}
