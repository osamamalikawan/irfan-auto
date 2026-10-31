"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { rs } from "@/lib/format";
import { telLink } from "@/lib/phone";
import { useMe } from "./Me";
import SupplierForm from "./SupplierForm";
import Toast from "./Toast";

type S = { id: string; code: string; name: string; name_ur: string | null; contact: string | null; phone: string | null; city: string | null; balance: number };

export default function SuppliersList() {
  const router = useRouter();
  const { can } = useMe();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [items, setItems] = useState<S[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");
  const req = useRef(0);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/suppliers?status=" + status + "&offset=" + offset + "&q=" + encodeURIComponent(q));
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load suppliers");
      setItems((p) => (offset ? [...p, ...j.items] : j.items)); setTotal(j.total);
    } catch (e) { if (id === req.current) setError((e as Error).message); }
    finally { if (id === req.current) setLoading(false); }
  }, [q, status]);
  useEffect(() => { const t = setTimeout(() => load(0), 250); return () => clearTimeout(t); }, [load]);

  const owed = items.reduce((x, s) => x + Math.max(s.balance, 0), 0);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 flex items-baseline justify-between lg:hidden"><h1 className="text-lg font-bold">Suppliers</h1><span className="text-xs text-muted">{total} suppliers</span></div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {can("suppliers.edit") && <button className="btn btn-primary lg:order-1" onClick={() => setAdding(true)}>Add supplier</button>}
          <div className="relative w-full lg:order-2 lg:flex-1">
            <input className="input pr-10" type="text" inputMode="search" placeholder="Search name, phone, city or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search suppliers" />
            {q && <button type="button" className="btn absolute inset-y-0 right-1 min-h-9 border-0 bg-transparent px-2" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
          </div>
        </div>
        <div className="mt-2 flex gap-2 lg:mt-3">
          <button className={"chip " + (status === "active" ? "chip-on" : "")} onClick={() => setStatus("active")}>Active</button>
          <button className={"chip " + (status === "archived" ? "chip-on" : "")} onClick={() => setStatus("archived")}>Archived</button>
        </div>
      </header>
      <div className="p-3 lg:px-5">
        {owed > 0 && <p className="mb-2 text-sm text-muted">We owe the suppliers shown: <b className="text-ink">{rs(owed)}</b></p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {items.map((s) => (
            <li key={s.id} className="card p-3">
              <Link href={"/suppliers/" + s.id} className="block active:opacity-70">
                <div className="flex items-start gap-2"><p className="min-w-0 flex-1 font-semibold leading-snug">{s.name}</p><span className="text-xs text-muted">{s.code}</span></div>
                {s.name_ur && <p className="ur text-sm text-muted">{s.name_ur}</p>}
                <p className="text-sm text-muted">{[s.contact, s.city].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-sm">{s.balance > 0 ? <span className="pill bg-amber-bg text-amber">We owe {rs(s.balance)}</span> : s.balance < 0 ? <span className="pill bg-green-bg text-green">Advance {rs(-s.balance)}</span> : <span className="pill bg-bg text-muted">Settled</span>}</p>
              </Link>
              {telLink(s.phone) && <a href={telLink(s.phone)!} className="btn mt-2 min-h-9 w-full justify-start gap-2 text-sm">📞 {s.phone}</a>}
            </li>
          ))}
        </ul>
        {error && <p className="mt-2 text-center text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p className="py-4 text-center text-sm text-muted">No suppliers {q ? "match" : "yet"}.</p>}
        {items.length < total && <div className="mt-3 text-center"><button className="btn" disabled={loading} onClick={() => load(items.length)}>{loading ? "Loading…" : "Load more"}</button></div>}
      </div>
      {adding && <SupplierForm supplier={null} onClose={() => setAdding(false)} onSaved={(m, id) => { setAdding(false); setToast(m); if (id) router.push("/suppliers/" + id); else load(0); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
