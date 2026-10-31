"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { rs } from "@/lib/format";
import { telLink, waLink } from "@/lib/phone";
import LedgerSection from "./LedgerSection";
import VisitHistory from "./VisitHistory";
import { MoveModal } from "./CustomersList";
import { useMe } from "./Me";
import Toast from "./Toast";

type Detail = {
  customer: {
    id: string; code: string; name: string; name_ur: string | null; owner: string | null; phone: string | null; phone2: string | null; address: string | null;
    cnic: string | null; ntn: string | null; email: string | null; gps: string | null; credit_limit: number; credit_days: number; opening_balance: number; balance: number; status: string; is_walk_in: boolean;
    area: { name: string; city: { name: string } | null } | null;
    route: { id: string; name: string; code: string | null; visit_days: string[]; salesman: { name: string } | null } | null;
  };
  remarks: { id: string; text: string; by_name: string; created_at: string }[];
  history: { id: string; from_date: string; to_date: string | null; route_name: string }[];
};

export default function CustomerDetail({ id }: { id: string }) {
  const { can, canAny } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [routes, setRoutes] = useState<{ id: string; name: string; salesman: { name: string } | null }[]>([]);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/customers/" + id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load");
    setD(j);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const canRoutes = can("routes.manage");
  useEffect(() => { if (canRoutes) fetch("/api/routes").then((r) => r.json()).then((j) => setRoutes(j.routes ?? [])).catch(() => {}); }, [canRoutes]);

  async function addRemark(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/customers/" + id + "/remarks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setToast(j.error || "Could not save");
    setText(""); load();
  }
  async function delRemark(rid: string) {
    if (!window.confirm("Delete this remark?")) return;
    await fetch("/api/customers/" + id + "/remarks?remark=" + rid, { method: "DELETE" });
    load();
  }
  async function setStatus(status: "active" | "archived") {
    if (status === "archived" && !window.confirm("Archive this customer? History is kept.")) return;
    const r = await fetch("/api/customers/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setToast(j.error || "Could not change status");
    setToast(status === "archived" ? "Archived" : "Restored"); load();
  }

  if (error) return <p className="p-4 text-red">{error} <Link href="/customers" className="underline">Back</Link></p>;
  if (!d) return <p className="p-4 text-muted">Loading…</p>;
  const c = d.customer;
  const place = [c.area?.name, c.area?.city?.name].filter(Boolean).join(", ");
  const phones = [c.phone, c.phone2].filter(Boolean) as string[];
  const canRemark = canAny(["customers.edit", "visits.record", "sales.create"]);

  return (
    <div>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/customers" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{c.name}</h1>
        {can("customers.edit") && <Link href={"/customers/" + id + "/edit"} className="btn">Edit</Link>}
      </header>

      <div className="space-y-3 p-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 lg:px-5">
        <div className="space-y-3">
          <section className="card p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{c.code}</span>
              {c.status === "archived" && <span className="pill bg-amber-bg text-amber">Archived</span>}
            </div>
            {c.name_ur && <p className="ur text-lg">{c.name_ur}</p>}
            {c.owner && <p className="text-sm text-muted">Owner: {c.owner}</p>}
            {phones.map((p) => (
              <div key={p} className="mt-2 flex gap-2">
                {telLink(p) && <a href={telLink(p)!} className="btn min-h-10 flex-1 justify-start">📞 {p}</a>}
                {waLink(p) && <a href={waLink(p)!} target="_blank" rel="noreferrer" className="btn min-h-10 px-3" aria-label={"WhatsApp " + p}>WhatsApp</a>}
              </div>
            ))}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {([["Address", c.address], ["Area", place || null], ["CNIC", c.cnic], ["NTN", c.ntn], ["Email", c.email], ["Location", c.gps]] as [string, string | null][])
                .filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="break-words font-medium">{v}</dd></div>))}
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Route and credit</h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div><dt className="text-xs text-muted">Route</dt><dd className="font-medium">{c.route ? c.route.name : <span className="text-red">Not in any route</span>}</dd></div>
              <div><dt className="text-xs text-muted">Salesman</dt><dd className="font-medium">{c.route?.salesman?.name ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Visit days</dt><dd className="font-medium">{c.route?.visit_days.length ? c.route.visit_days.join(", ") : "—"}</dd></div>
              <div><dt className="text-xs text-muted">Credit limit</dt><dd className="font-medium">{c.credit_limit > 0 ? rs(c.credit_limit) : "None"}</dd></div>
              <div><dt className="text-xs text-muted">Credit days</dt><dd className="font-medium">{c.credit_days || "—"}</dd></div>
              <div><dt className="text-xs text-muted">Balance now</dt><dd className={"font-medium " + (c.balance > 0 ? "text-red" : "")}>{rs(c.balance)}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {can("routes.manage") && !c.is_walk_in && <button className="btn" onClick={() => setMoving(true)}>Change route</button>}
              {can("customers.edit") && !c.is_walk_in && (c.status === "active"
                ? <button className="btn" onClick={() => setStatus("archived")}>Archive</button>
                : <button className="btn btn-primary" onClick={() => setStatus("active")}>Make active</button>)}
            </div>
            {d.history.length > 1 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted">Route history</summary>
                <ul className="mt-1 space-y-0.5">{d.history.map((h) => <li key={h.id}>{h.route_name} <span className="text-xs text-muted">{h.from_date} → {h.to_date ?? "now"}</span></li>)}</ul>
              </details>
            )}
          </section>
        </div>

        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Remarks</h2>
          {canRemark && (
            <form onSubmit={addRemark} className="mb-3 space-y-2">
              <textarea className="input min-h-20 py-2" rows={2} maxLength={500} placeholder="e.g. pays on Fridays, call before visiting" value={text} onChange={(e) => setText(e.target.value)} aria-label="New remark" />
              <button className="btn btn-primary w-full" disabled={busy || !text.trim()}>{busy ? "Saving…" : "Add remark"}</button>
            </form>
          )}
          {!d.remarks.length && <p className="text-sm text-muted">No remarks yet.</p>}
          <ul className="divide-y divide-line">
            {d.remarks.map((r) => (
              <li key={r.id} className="flex gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm">{r.text}</p>
                  <p className="text-xs text-muted">{r.by_name} · {new Date(r.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                {can("customers.edit") && <button className="btn min-h-8 border-0 bg-transparent px-2 text-muted" onClick={() => delRemark(r.id)} aria-label="Delete remark">✕</button>}
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-3 lg:col-span-2">
          <VisitHistory customerId={id} />
          <LedgerSection customerId={id} customerName={c.name} isWalkIn={c.is_walk_in} />
        </div>
      </div>

      {moving && <MoveModal ids={[id]} routes={routes} onClose={() => setMoving(false)} onDone={() => { setMoving(false); setToast("Route changed"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
