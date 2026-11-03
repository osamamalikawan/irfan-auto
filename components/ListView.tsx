"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { rs } from "@/lib/format";
import { ListSkeleton, LoadingBar, Spinner } from "./Loading";
import ListPrintModal from "./ListPrintModal";
import { useMe } from "./Me";
import Toast from "./Toast";

type P = { id: string; name_en: string; name_ur: string | null; code_name: string | null; cp: number; purchase_price?: number; scheme: string | null; unit: string };
type Meta = { id: string; name: string; products: number; is_market: boolean };
const PAGE = 50;

/** One price list: search, add, edit, soft delete (with restore) and print on A4. */
export default function ListView({ id }: { id: string }) {
  const { can } = useMe();
  const canEdit = can("stock.manage");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<P[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"active" | "deleted">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<P | "new" | null>(null);
  const [print, setPrint] = useState(false);
  const [canPP, setCanPP] = useState(false);
  const [toast, setToast] = useState("");
  const req = useRef(0);

  const loadMeta = useCallback(async () => {
    const r = await fetch("/api/inventory/lists"); const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not load the list");
    const m = (j.lists as Meta[]).find((l) => l.id === id);
    if (!m) return setError("List not found");
    setMeta(m);
  }, [id]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const load = useCallback(async (offset: number) => {
    const n = ++req.current;
    setLoading(true); setError("");
    try {
      const r = view === "deleted" ? await fetch("/api/inventory/lists/" + id + "/deleted") : await fetch("/api/inventory/lists/" + id + "/products?limit=" + PAGE + "&offset=" + offset + "&q=" + encodeURIComponent(q.trim()));
      const j = await r.json();
      if (n !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load the products");
      setItems((prev) => (offset ? [...prev, ...j.items] : j.items));
      setTotal(view === "deleted" ? j.items.length : j.total);
      if (view === "active") setCanPP(!!j.can_see_pp);
    } catch (e) { if (n === req.current) setError((e as Error).message); }
    finally { if (n === req.current) setLoading(false); }
  }, [id, q, view]);
  useEffect(() => { const t = setTimeout(() => load(0), 250); return () => clearTimeout(t); }, [load]);

  async function setActive(p: P, active: boolean) {
    const r = await fetch("/api/inventory/products/" + p.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setToast(j.error || "Could not save");
    setItems((l) => l.filter((x) => x.id !== p.id)); setTotal((t) => t - 1);
    setToast(p.name_en + (active ? " restored" : " deleted. Open Deleted to restore it")); loadMeta();
  }
  async function toggleMarket(on: boolean) {
    setMeta((m) => m && { ...m, is_market: on });
    const r = await fetch("/api/inventory/lists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, is_market: on }) });
    if (!r.ok) { loadMeta(); const j = await r.json().catch(() => ({})); setToast(j.error || "Could not save"); }
  }

  return (
    <div>
      <header className="border-b border-line bg-bg px-3 pb-2 pt-3 lg:border-0 lg:px-5 lg:pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/lists" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
          <div className="min-w-0 flex-1"><h1 className="text-lg font-bold leading-tight">{meta?.name ?? "Price list"}</h1><p className="text-xs text-muted">{meta ? meta.products.toLocaleString() + " products" : ""}</p></div>
          {meta && can("stock.manage") && <label className="flex items-center gap-2 text-sm" title="Parts in a market list are bought from the market when sold"><input type="checkbox" className="size-5" checked={meta.is_market} onChange={(e) => toggleMarket(e.target.checked)} />Market list</label>}
          <button className="btn" onClick={() => setPrint(true)} disabled={!meta}>Print A4</button>
          {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}>＋ Add product</button>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Show" className="flex gap-2">
            <button className={"chip " + (view === "active" ? "chip-on" : "")} onClick={() => { setView("active"); setItems([]); }}>Products</button>
            {canEdit && <button className={"chip " + (view === "deleted" ? "chip-on" : "")} onClick={() => { setView("deleted"); setItems([]); }}>Deleted</button>}
          </div>
          {view === "active" && <input className="input max-w-md flex-1" type="text" inputMode="search" placeholder="Search name, Urdu name or code" aria-label="Search this list" value={q} onChange={(e) => setQ(e.target.value)} />}
        </div>
        <LoadingBar active={loading} className="mt-2" />
      </header>
      {loading && !items.length && !error && <ListSkeleton />}
      {error && <p role="alert" className="m-3 rounded-lg bg-red-bg p-2 text-sm text-red lg:mx-5">{error}</p>}

      {items.length > 0 && (
        <section className="card mx-3 mt-3 overflow-x-auto p-3 lg:mx-5">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead><tr className="text-left text-[12.5px] text-muted">
              <th className="border-b border-line px-2 py-1.5 font-semibold">Product</th><th className="border-b border-line px-2 py-1.5 text-right font-semibold">اردو نام</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold">Code</th><th className="border-b border-line px-2 py-1.5 text-right font-semibold">Price</th>{canPP && view === "active" && <th className="border-b border-line px-2 py-1.5 text-right font-semibold">PP</th>}
              <th className="border-b border-line px-2 py-1.5 font-semibold">Scheme</th><th className="border-b border-line px-2 py-1.5" />
            </tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-bg">
                  <td className="border-b border-line px-2 py-2 font-medium">{p.name_en}</td>
                  <td className="ur border-b border-line px-2 py-2 text-right">{p.name_ur}</td>
                  <td className="border-b border-line px-2 py-2 text-muted">{p.code_name}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{rs(p.cp)}</td>
                  {canPP && view === "active" && <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right text-muted">{rs(p.purchase_price ?? 0)}</td>}
                  <td className="border-b border-line px-2 py-2">{p.scheme && <span className="pill border border-amber bg-amber-bg font-bold text-amber">{p.scheme}</span>}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">
                    {canEdit && (view === "active"
                      ? <><button className="btn min-h-8 px-2.5 text-[13px]" onClick={() => setEdit(p)}>Edit</button> <button className="btn min-h-8 px-2.5 text-[13px] text-red" onClick={() => { if (confirm("Delete " + p.name_en + "? You can restore it from Deleted.")) setActive(p, false); }}>Delete</button></>
                      : <button className="btn min-h-8 px-2.5 text-[13px]" onClick={() => setActive(p, true)}>Restore</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <div className="px-3 pb-6 pt-3 text-center text-sm text-muted lg:px-5">
        {!loading && !error && !items.length && <p>{view === "deleted" ? "Nothing deleted in this list." : "No products match."}</p>}
        {view === "active" && items.length < total && <button className="btn" disabled={loading} onClick={() => load(items.length)}>{loading ? <><Spinner /> Loading…</> : "Load more (" + (total - items.length) + " left)"}</button>}
      </div>

      {edit && meta && <ProductModal canPP={canPP} listName={meta.name} product={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={(msg) => { setEdit(null); setToast(msg); load(0); loadMeta(); }} />}
      {print && meta && <ListPrintModal listId={id} name={meta.name} onClose={() => setPrint(false)} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function ProductModal({ canPP, listName, product, onClose, onSaved }: { canPP: boolean; listName: string; product: P | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState({ name_en: product?.name_en ?? "", name_ur: product?.name_ur ?? "", code_name: product?.code_name ?? "", cp: product ? String(product.cp) : "", purchase_price: product?.purchase_price ? String(product.purchase_price) : "", scheme: product?.scheme ?? "", unit: product?.unit ?? "pc" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name_en.trim()) return setError("Enter the product name.");
    setBusy(true); setError("");
    const { purchase_price, ...rest } = f;
    const body = { ...rest, cp: Number(f.cp) || 0, ...(canPP ? { purchase_price: Number(purchase_price) || 0 } : {}), ...(product ? {} : { list: listName }) };
    const r = await fetch(product ? "/api/inventory/products/" + product.id : "/api/inventory/products", { method: product ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onSaved(product ? "Saved " + f.name_en : "Added " + f.name_en);
  }
  const field = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={"lp-" + k}>{label}</label><input id={"lp-" + k} className="input" value={f[k]} onChange={set(k)} {...extra} /></div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={product ? "Edit product" : "Add product"} onSubmit={save} onClick={(e) => e.stopPropagation()} className="grid w-full max-w-lg grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <h2 className="col-span-2 text-base font-semibold">{product ? "Edit product" : "Add product"} <span className="text-sm font-normal text-muted">· {listName}</span></h2>
        <div className="col-span-2">{field("name_en", "Name (English) *", { autoFocus: true, maxLength: 200 })}</div>
        <div className="col-span-2"><label className="label" htmlFor="lp-ur">Name (Urdu)</label><input id="lp-ur" className="input ur" value={f.name_ur} onChange={set("name_ur")} maxLength={200} /></div>
        {field("code_name", "Code", { maxLength: 80 })}
        {field("cp", "Price (Rs)", { inputMode: "decimal" })}
        {canPP && field("purchase_price", "Purchase price, PP (Rs)", { inputMode: "decimal" })}
        {field("scheme", "Scheme (for example 9+1)", { maxLength: 20 })}
        {field("unit", "Unit", { maxLength: 20 })}
        {error && <p role="alert" className="col-span-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? <><Spinner /> Saving…</> : "Save"}</button></div>
      </form>
    </div>
  );
}
