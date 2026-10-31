"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { rs } from "@/lib/format";
import { telLink, waLink } from "@/lib/phone";
import { useMe } from "./Me";
import PaySupplierModal from "./PaySupplierModal";
import StatementTable, { type Statement } from "./StatementTable";
import SupplierForm, { type SupplierRow } from "./SupplierForm";
import Toast from "./Toast";

type Detail = { supplier: SupplierRow & { code: string; status: string; balance: number }; purchases: { id: string; no: string; purchase_date: string; total: number; paid: number; status: string; supplier_inv_no: string | null }[] };

export default function SupplierDetail({ id }: { id: string }) {
  const { can } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [toast, setToast] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [st, setSt] = useState<Statement | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/suppliers/" + id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the supplier");
    setD(j);
  }, [id]);
  const loadSt = useCallback(async () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const r = await fetch("/api/suppliers/" + id + "/ledger?" + p);
    if (r.ok) setSt(await r.json());
  }, [id, from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (can("suppliers.view") || can("suppliers.pay") || can("suppliers.edit")) loadSt(); }, [loadSt, can]);

  async function setStatus(status: "active" | "archived") {
    if (status === "archived" && !window.confirm("Archive this supplier? History is kept.")) return;
    const r = await fetch("/api/suppliers/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setToast(j.error || "Could not change status");
    setToast(status === "archived" ? "Archived" : "Made active"); load();
  }

  if (error) return <p className="p-4 text-red">{error} <Link href="/suppliers" className="underline">Back</Link></p>;
  if (!d) return <p className="p-4 text-muted">Loading…</p>;
  const s = d.supplier;
  const phones = [s.phone, s.phone2].filter(Boolean) as string[];

  return (
    <div>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/suppliers" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{s.name}</h1>
        {can("suppliers.edit") && <button className="btn" onClick={() => setEdit(true)}>Edit</button>}
      </header>
      <div className="space-y-3 p-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 lg:px-5">
        <div className="space-y-3">
          <section className="card p-4">
            <div className="flex items-center gap-2"><span className="text-xs text-muted">{s.code}</span>{s.status === "archived" && <span className="pill bg-amber-bg text-amber">Archived</span>}</div>
            {s.name_ur && <p className="ur text-lg">{s.name_ur}</p>}
            {s.contact && <p className="text-sm text-muted">Contact: {s.contact}</p>}
            {phones.map((p) => (
              <div key={p} className="mt-2 flex gap-2">
                {telLink(p) && <a href={telLink(p)!} className="btn min-h-10 flex-1 justify-start">📞 {p}</a>}
                {waLink(p) && <a href={waLink(p)!} target="_blank" rel="noreferrer" className="btn min-h-10 px-3">WhatsApp</a>}
              </div>
            ))}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {([["Address", s.address], ["City", s.city], ["NTN", s.ntn], ["Email", s.email], ["Credit days", s.credit_days ? String(s.credit_days) : null], ["Notes", s.notes]] as [string, string | null][])
                .filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="break-words font-medium">{v}</dd></div>))}
            </dl>
          </section>
          <section className="card p-4">
            <p className="text-xs text-muted">{s.balance < 0 ? "Advance paid to supplier" : "We owe this supplier"}</p>
            <p className={"text-2xl font-bold " + (s.balance > 0 ? "text-amber" : "")}>{rs(Math.abs(s.balance))}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {can("purchases.create") && s.status === "active" && <Link href={"/purchases/new?supplier=" + id} className="btn btn-primary">New purchase</Link>}
              {can("suppliers.pay") && <button className="btn" onClick={() => setPay(true)}>Pay supplier</button>}
              {can("suppliers.edit") && (s.status === "active" ? <button className="btn" onClick={() => setStatus("archived")}>Archive</button> : <button className="btn btn-primary" onClick={() => setStatus("active")}>Make active</button>)}
            </div>
          </section>
        </div>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Recent purchases</h2>
          {!d.purchases.length && <p className="text-sm text-muted">No purchases yet.</p>}
          <ul className="divide-y divide-line">
            {d.purchases.map((p) => (
              <li key={p.id}><Link href={"/purchases/" + p.id} className="flex items-center gap-2 py-2 active:opacity-70">
                <span className="min-w-0 flex-1"><span className="block font-medium">{p.no}{p.status === "cancelled" && <span className="ml-2 pill bg-bg text-muted">Cancelled</span>}</span>
                  <span className="text-xs text-muted">{niceDate(p.purchase_date)}{p.supplier_inv_no ? " · bill " + p.supplier_inv_no : ""}</span></span>
                <span className="font-semibold">{rs(p.total)}</span>
              </Link></li>
            ))}
          </ul>
        </section>
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Statement</h2>
          <div className="mb-2 grid max-w-md grid-cols-2 gap-2">
            <div><label className="label" htmlFor="ss-from">From</label><input id="ss-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="label" htmlFor="ss-to">To</label><input id="ss-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          {st && <StatementTable d={st} from={from} debitLabel="Purchases" creditLabel="Paid" />}
        </section>
      </div>
      {edit && <SupplierForm supplier={s} onClose={() => setEdit(false)} onSaved={(m) => { setEdit(false); setToast(m); load(); }} />}
      {pay && <PaySupplierModal supplier={{ id, name: s.name }} balance={s.balance} onClose={() => setPay(false)} onDone={(m) => { setPay(false); setToast(m); load(); loadSt(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
