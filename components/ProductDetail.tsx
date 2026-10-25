"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdjustSheet from "./AdjustSheet";
import { qty, rs, stockTone, toneClass } from "@/lib/format";

type Detail = {
  product: {
    id: string; name_en: string; code_name: string | null; name_ur: string | null; scheme: string | null; cp: number;
    unit: string; reorder_level: number; legacy_no: number | null;
    brand: { name: string } | null; company: { name: string } | null; list: { name: string } | null;
  };
  locations: { id: string; name: string; qty: number; racks: string[] }[];
  onHand: number;
  movements: { id: string; qty: number; type: string; note: string | null; created_at: string; location: { name: string } | null }[];
};
const TYPE: Record<string, string> = { opening: "Opening", receive: "Received", issue: "Issued", adjust: "Adjusted" };

export default function ProductDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<{ loc?: string } | null>(null);
  const [allLocs, setAllLocs] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/inventory/products/" + id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load");
    setD(j);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/inventory/meta").then((r) => r.json()).then((m) => setAllLocs(m.locations ?? [])).catch(() => {}); }, []);

  if (error) return <p className="p-4 text-red">{error} <Link href="/inventory" className="underline">Back</Link></p>;
  if (!d) return <p className="p-4 text-muted">Loading…</p>;
  const p = d.product;
  const tone = stockTone(d.onHand, Number(p.reorder_level));
  // locations the sheet can pick: the product's own, plus any other location (to receive stock somewhere new)
  const sheetLocs = [...d.locations, ...allLocs.filter((l) => !d.locations.some((x) => x.id === l.id)).map((l) => ({ ...l, qty: 0, racks: [] }))];

  return (
    <div>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/inventory" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{p.name_en}</h1>
        <Link href={"/inventory/" + id + "/edit"} className="btn">Edit</Link>
      </header>

      <div className="space-y-3 p-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 lg:px-5">
        <div className="space-y-3">
        <section className="card p-4">
          {p.name_ur && <p className="ur mb-2 text-lg">{p.name_ur}</p>}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted">On hand</p>
              <p className={"pill text-3xl " + toneClass[tone]}>{qty(d.onHand)} <span className="ml-1 text-base font-normal">{p.unit}</span></p>
            </div>
            <div className="text-right text-sm">
              <p className="text-xs text-muted">Counter price (CP)</p>
              <p className="text-lg font-semibold">{rs(p.cp)}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {([["Code", p.code_name], ["List", p.list?.name], ["Brand", p.brand?.name], ["Company", p.company?.name], ["Scheme", p.scheme],
               ["Reorder at", Number(p.reorder_level) > 0 ? qty(p.reorder_level) : null], ["Sheet #", p.legacy_no]] as [string, string | number | null | undefined][])
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="break-words font-medium">{v}</dd></div>))}
          </dl>
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Where it is</h2>
            <button className="btn btn-primary min-h-9" onClick={() => setSheet({})}>Change stock</button>
          </div>
          {!d.locations.length && <p className="text-sm text-muted">No location yet. Tap Edit to add one.</p>}
          <ul className="divide-y divide-line">
            {d.locations.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-sm text-muted">{l.racks.length ? "Rack " + l.racks.join(", ") : "No rack assigned"}</p>
                </div>
                <span className="text-lg font-semibold">{qty(l.qty)}</span>
                <button className="btn min-h-9 px-3" onClick={() => setSheet({ loc: l.id })} aria-label={"Change stock at " + l.name}>±</button>
              </li>
            ))}
          </ul>
        </section>

        </div>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">History</h2>
          {!d.movements.length && <p className="text-sm text-muted">No stock movements yet.</p>}
          <ul className="divide-y divide-line">
            {d.movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{TYPE[m.type] ?? m.type} · {m.location?.name}</p>
                  <p className="truncate text-xs text-muted">{new Date(m.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}{m.note ? " · " + m.note : ""}</p>
                </div>
                <span className={"font-semibold " + (Number(m.qty) > 0 ? "text-green" : "text-red")}>{Number(m.qty) > 0 ? "+" : ""}{qty(m.qty)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {sheet && (
        <AdjustSheet productId={id} unit={p.unit} locations={sheetLocs} initialLocation={sheet.loc}
          onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />
      )}
    </div>
  );
}
