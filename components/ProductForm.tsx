"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading, Spinner } from "./Loading";

type Row = { location: string; racks: string };
type Meta = { lists: { id: string; name: string }[]; locations: { id: string; name: string }[]; companies: string[]; brands: string[] };

const splitRacks = (s: string) => [...new Set(s.split(/[,،;]/).map((x) => x.trim()).filter(Boolean))];

export default function ProductForm({ id }: { id?: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({ name_en: "", code_name: "", name_ur: "", company: "", brand: "", list: "", scheme: "", cp: "", unit: "pc", reorder_level: "", opening_stock: "" });
  const [rows, setRows] = useState<Row[]>([{ location: "", racks: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => { fetch("/api/inventory/meta").then((r) => r.json()).then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    if (!id) return;
    fetch("/api/inventory/products/" + id).then((r) => r.json()).then((d) => {
      if (d.error) return setError(d.error);
      const p = d.product;
      setF((s) => ({ ...s, name_en: p.name_en ?? "", code_name: p.code_name ?? "", name_ur: p.name_ur ?? "", company: p.company?.name ?? "", brand: p.brand?.name ?? "",
        list: p.list?.name ?? "", scheme: p.scheme ?? "", cp: String(p.cp ?? ""), unit: p.unit ?? "pc", reorder_level: Number(p.reorder_level) ? String(p.reorder_level) : "" }));
      setRows(d.locations.length ? d.locations.map((l: { name: string; racks: string[] }) => ({ location: l.name, racks: l.racks.join(", ") })) : [{ location: "", racks: "" }]);
      setLoaded(true);
    }).catch(() => setError("Could not load"));
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body = {
      ...f, placement: rows.filter((r) => r.location.trim()).map((r) => ({ location: r.location.trim(), racks: splitRacks(r.racks) })),
    };
    const r = await fetch(id ? "/api/inventory/products/" + id : "/api/inventory/products", {
      method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    router.replace("/inventory/" + (id ?? j.id));
    router.refresh();
  }

  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form onSubmit={save} className="lg:max-w-3xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href={id ? "/inventory/" + id : "/inventory"} className="btn border-0 bg-transparent px-3 text-xl" aria-label="Cancel">←</Link>
        <h1 className="flex-1 text-base font-bold">{id ? "Edit product" : "New product"}</h1>
        <button className="btn btn-primary" disabled={busy || !loaded || !f.name_en.trim()}>{busy ? <><Spinner /> Saving…</> : "Save"}</button>
      </header>

      <div className="space-y-4 p-3 lg:px-5">
        {!loaded && !error && <Loading />}
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}

        <section className="card space-y-3 p-4">
          <div><label className="label" htmlFor="f-name">Name (English) *</label><input id="f-name" className="input" required value={f.name_en} onChange={set("name_en")} /></div>
          <div><label className="label" htmlFor="f-ur">Name (Urdu)</label><input id="f-ur" className="input ur" dir="rtl" value={f.name_ur} onChange={set("name_ur")} /></div>
          <div><label className="label" htmlFor="f-code">Code name</label><input id="f-code" className="input" value={f.code_name} onChange={set("code_name")} /></div>
        </section>

        <section className="card space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="f-company">Company</label><input id="f-company" className="input" list="dl-company" value={f.company} onChange={set("company")} /></div>
            <div><label className="label" htmlFor="f-brand">Brand</label><input id="f-brand" className="input" list="dl-brand" value={f.brand} onChange={set("brand")} /></div>
            <div><label className="label" htmlFor="f-list">List</label><input id="f-list" className="input" list="dl-list" value={f.list} onChange={set("list")} /></div>
            <div><label className="label" htmlFor="f-scheme">Scheme (e.g. 9+1)</label><input id="f-scheme" className="input" value={f.scheme} onChange={set("scheme")} /></div>
            <div><label className="label" htmlFor="f-cp">Counter price (CP)</label><input id="f-cp" className="input" type="number" inputMode="decimal" min="0" step="any" value={f.cp} onChange={set("cp")} /></div>
            <div><label className="label" htmlFor="f-unit">Unit</label><input id="f-unit" className="input" value={f.unit} onChange={set("unit")} /></div>
            <div><label className="label" htmlFor="f-reorder">Reorder level</label><input id="f-reorder" className="input" type="number" inputMode="decimal" min="0" step="any" value={f.reorder_level} onChange={set("reorder_level")} /></div>
            {!id && <div><label className="label" htmlFor="f-open">Opening stock</label><input id="f-open" className="input" type="number" inputMode="decimal" min="0" step="any" value={f.opening_stock} onChange={set("opening_stock")} /></div>}
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Locations &amp; racks</h2>
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line p-3">
              <div className="flex gap-2">
                <input className="input" list="dl-loc" placeholder="Location (e.g. Godown 1)" value={r.location} onChange={(e) => upd(i, { location: e.target.value })} aria-label="Location" />
                {rows.length > 1 && <button type="button" className="btn px-3" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove location">✕</button>}
              </div>
              <input className="input" placeholder="Racks, comma separated (e.g. G1-03, G1-04)" value={r.racks} onChange={(e) => upd(i, { racks: e.target.value })} aria-label="Racks" />
            </div>
          ))}
          <button type="button" className="btn w-full" onClick={() => setRows((rs) => [...rs, { location: "", racks: "" }])}>＋ Add another location</button>
        </section>
      </div>

      <datalist id="dl-company">{meta?.companies.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-brand">{meta?.brands.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-list">{meta?.lists.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <datalist id="dl-loc">{meta?.locations.map((c) => <option key={c.id} value={c.name} />)}</datalist>
    </form>
  );
}
