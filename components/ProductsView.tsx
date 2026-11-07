"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { qty, rs } from "@/lib/format";
import { useMe } from "./Me";
import ProductEditModal, { type ProductMeta, type ProductRow } from "./ProductEditModal";
import SupplierPicks from "./SupplierPicks";
import Toast from "./Toast";
import { ListSkeleton, LoadingBar, Spinner } from "./Loading";

const PAGE = 30;
const FILTERS: [string, string][] = [["all", "All"], ["low", "Low stock"], ["nosupplier", "No supplier"], ["nobrand", "No brand"], ["nocompany", "No company"], ["nolist", "No list"], ["norp", "No RP"]];

/** Products of active lists: search, filter, edit, and move to an inactive list. */
export default function ProductsView() {
  const { can } = useMe();
  const canEdit = can("stock.manage");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [list, setList] = useState("");
  const [company, setCompany] = useState("");
  const [brand, setBrand] = useState("");
  const [supplier, setSupplier] = useState("");
  const [meta, setMeta] = useState<ProductMeta | null>(null);
  const [items, setItems] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<ProductRow | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [toast, setToast] = useState("");
  const req = useRef(0);

  const loadMeta = useCallback(() => { fetch("/api/products/meta").then((r) => r.json()).then((m) => { if (!m.error) setMeta(m); }).catch(() => {}); }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    const p = new URLSearchParams({ q, filter, offset: String(offset), limit: String(PAGE) });
    if (list) p.set("list", list);
    if (company) p.set("company", company);
    if (brand) p.set("brand", brand);
    if (supplier) p.set("supplier", supplier);
    try {
      const r = await fetch("/api/products?" + p);
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load products");
      setItems((prev) => (offset ? [...prev, ...j.items] : j.items));
      setTotal(j.total);
    } catch (e) {
      if (id === req.current) setError((e as Error).message);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [q, filter, list, company, brand, supplier]);
  useEffect(() => { const t = setTimeout(() => { setSel(new Set()); load(0); }, 250); return () => clearTimeout(t); }, [load]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = items.length > 0 && items.every((i) => sel.has(i.id));
  const activeLists = meta?.lists.filter((l) => l.visible) ?? [];

  const Suppliers = ({ it }: { it: ProductRow }) => it.suppliers.length
    ? <>{it.suppliers.map((s) => <Link key={s.id} href={"/suppliers/" + s.id} className="pill mr-1 bg-bg text-muted hover:underline">{s.name}</Link>)}</>
    : <span className="text-muted">—</span>;

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pb-0 lg:pt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h1 className="text-lg font-bold leading-tight">Products</h1>
          <span className="text-xs text-muted">{loading && !items.length ? <><Spinner /> Loading…</> : total.toLocaleString() + " products"}</span>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative w-full lg:flex-1">
            <input className="input pr-10" type="text" inputMode="search" enterKeyHint="search" placeholder="Search name, Urdu, code, brand, company or supplier" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
            {q && <button type="button" className="btn absolute inset-y-0 right-1 min-h-9 border-0 bg-transparent px-2" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
          </div>
          {canEdit && <Link href="/inventory/new" className="btn btn-primary hidden lg:inline-flex">Add Product</Link>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 lg:flex">
          <select className="input lg:w-44" value={list} onChange={(e) => setList(e.target.value)} aria-label="List">
            <option value="">All active lists</option>
            {activeLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="input lg:w-44" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company">
            <option value="">All companies</option>
            {meta?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input lg:w-44" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
            <option value="">All brands</option>
            {meta?.brands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input lg:w-44" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
            <option value="">All suppliers</option>
            {meta?.suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 lg:mt-3">
          {FILTERS.map(([k, label]) => <button key={k} className={"chip " + (filter === k ? "chip-on" : "")} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
        {canEdit && sel.size > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2">
            <span className="flex-1 text-sm">{sel.size} selected</span>
            <button className="btn min-h-9" onClick={() => setSel(new Set())}>Clear</button>
            <button className="btn min-h-9" onClick={() => setChanging(true)}>Change company / brand / supplier…</button>
            <button className="btn btn-primary min-h-9" onClick={() => setMoving(true)}>Move to list…</button>
          </div>
        )}
        <LoadingBar active={loading} className="mt-2" />
      </header>
      {loading && !items.length && !error && <ListSkeleton />}
      <p className="mx-3 mt-2 text-xs text-muted lg:mx-5">Only products of active lists are shown. Move a product to an inactive list to take it off this page.</p>

      {/* phone: cards */}
      <ul className="space-y-2 p-3 lg:hidden">
        {items.map((it) => (
          <li key={it.id} className="card p-3">
            <div className="flex items-start gap-2">
              {canEdit && <input type="checkbox" className="mt-1 size-4" checked={sel.has(it.id)} onChange={() => toggle(it.id)} aria-label={"Select " + it.name_en} />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{it.name_en}</p>
                {it.name_ur && <p className="ur text-sm text-muted">{it.name_ur}</p>}
                <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted">
                  {it.list_name && <span className="pill bg-bg">{it.list_name}</span>}
                  {it.company && <span className="pill bg-bg">{it.company}</span>}
                  {it.brand && <span className="pill bg-bg">{it.brand}</span>}
                </div>
                <p className="mt-1 text-xs"><span className="text-muted">Suppliers: </span><Suppliers it={it} /></p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">CP {rs(it.cp)}</p>
                <p className="text-xs text-muted">{Number(it.rp) > 0 ? "RP " + rs(it.rp) : "No RP"}</p>
                <p className="text-xs text-muted">{qty(it.on_hand)} {it.unit}</p>
              </div>
            </div>
            {canEdit && meta && <button className="btn mt-2 min-h-9 w-full" onClick={() => setEdit(it)}>Edit</button>}
          </li>
        ))}
      </ul>

      {/* desktop: table */}
      <section className="card mx-5 mt-3 hidden p-3.5 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[12.5px] text-muted">
                <th className="w-8 border-b border-line px-2 py-1.5">{canEdit && <input type="checkbox" className="size-4" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(items.map((i) => i.id)))} aria-label="Select all shown" />}</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Product</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Company</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Brand</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">Suppliers</th>
                <th className="border-b border-line px-2 py-1.5 font-semibold">List</th>
                <th className="border-b border-line px-2 py-1.5 text-right font-semibold">On hand</th>
                <th className="border-b border-line px-2 py-1.5 text-right font-semibold">CP</th>
                <th className="border-b border-line px-2 py-1.5 text-right font-semibold">RP</th>
                <th className="border-b border-line px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-bg">
                  <td className="border-b border-line px-2 py-2">{canEdit && <input type="checkbox" className="size-4" checked={sel.has(it.id)} onChange={() => toggle(it.id)} aria-label={"Select " + it.name_en} />}</td>
                  <td className="border-b border-line px-2 py-2">
                    <Link href={"/inventory/" + it.id} className="font-semibold hover:underline">{it.name_en}</Link>
                    {it.name_ur && <div className="ur text-[13px] leading-8 text-muted">{it.name_ur}</div>}
                    {it.code_name && <div className="text-xs text-muted">{it.code_name}</div>}
                  </td>
                  <td className="border-b border-line px-2 py-2">{it.company ?? <span className="text-muted">—</span>}</td>
                  <td className="border-b border-line px-2 py-2">{it.brand ?? <span className="text-muted">—</span>}</td>
                  <td className="border-b border-line px-2 py-2"><Suppliers it={it} /></td>
                  <td className="border-b border-line px-2 py-2">{it.list_name ?? <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{qty(it.on_hand)} <span className="text-xs text-muted">{it.unit}</span></td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right font-semibold">{rs(it.cp)}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right font-semibold">{Number(it.rp) > 0 ? rs(it.rp) : <span className="font-normal text-muted">—</span>}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{canEdit && meta && <button className="btn min-h-8 px-2 text-[13px]" onClick={() => setEdit(it)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="px-3 pb-6 text-center text-sm text-muted lg:px-5 lg:pt-3">
        {error && <p className="mb-2 text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p>No product matches these filters.</p>}
        {items.length < total && (
          <button className="btn w-full lg:w-auto" disabled={loading} onClick={() => load(items.length)}>
            {loading ? <><Spinner /> Loading…</> : "Load more (" + (total - items.length).toLocaleString() + " left)"}
          </button>
        )}
      </div>

      {edit && meta && <ProductEditModal product={edit} meta={meta} onClose={() => setEdit(null)} onSaved={(m) => { setEdit(null); setToast(m); loadMeta(); load(0); }} />}
      {moving && meta && <MoveListModal ids={[...sel]} lists={meta.lists} onClose={() => setMoving(false)} onDone={(m) => { setMoving(false); setSel(new Set()); setToast(m); loadMeta(); load(0); }} />}
      {changing && meta && <BulkChangeModal ids={[...sel]} meta={meta} onClose={() => setChanging(false)} onDone={(m) => { setChanging(false); setSel(new Set()); setToast(m); loadMeta(); load(0); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

/** Change company, brand and/or suppliers of every selected product. Only the parts that are switched on are touched. */
function BulkChangeModal({ ids, meta, onClose, onDone }: { ids: string[]; meta: ProductMeta; onClose: () => void; onDone: (m: string) => void }) {
  const [on, setOn] = useState({ company: false, brand: false, suppliers: false });
  const [company, setCompany] = useState("");
  const [brand, setBrand] = useState("");
  const [sup, setSup] = useState<string[]>([]);
  const [mode, setMode] = useState<"add" | "replace" | "remove">("add");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flip = (k: keyof typeof on) => setOn((s) => ({ ...s, [k]: !s[k] }));
  const any = on.company || on.brand || on.suppliers;
  const valid = any && (!on.suppliers || mode === "replace" || sup.length > 0);

  async function go() {
    setBusy(true); setError("");
    const body: Record<string, unknown> = { ids };
    if (on.company) body.company = company;
    if (on.brand) body.brand = brand;
    if (on.suppliers) { body.supplier_ids = sup; body.supplier_mode = mode; }
    const r = await fetch("/api/products/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not change the products");
    onDone(j.changed + " product(s) updated");
  }
  const Switch = ({ k, label }: { k: keyof typeof on; label: string }) => (
    <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="size-4" checked={on[k]} onChange={() => flip(k)} /> {label}</label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Change selected products" onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4">
        <h2 className="text-base font-semibold">Change {ids.length} product(s)</h2>
        <p className="mt-1 text-sm text-muted">Switch on what you want to change. Everything else stays as it is.</p>
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <Switch k="company" label="Company" />
            {on.company && <><input className="input" list="bk-dl-company" placeholder="Company name (leave empty to clear)" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company" />
              <datalist id="bk-dl-company">{meta.companies.map((c) => <option key={c.id} value={c.name} />)}</datalist></>}
          </div>
          <div className="space-y-2">
            <Switch k="brand" label="Brand" />
            {on.brand && <><input className="input" list="bk-dl-brand" placeholder="Brand name (leave empty to clear)" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand" />
              <datalist id="bk-dl-brand">{meta.brands.map((c) => <option key={c.id} value={c.name} />)}</datalist></>}
          </div>
          <div className="space-y-2">
            <Switch k="suppliers" label="Suppliers" />
            {on.suppliers && (
              <>
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="How to change suppliers">
                  <option value="add">Add these suppliers (keep the existing ones)</option>
                  <option value="replace">Replace all suppliers with these</option>
                  <option value="remove">Remove these suppliers</option>
                </select>
                <SupplierPicks options={meta.suppliers} value={sup} onChange={setSup} />
                {mode === "replace" && !sup.length && <p className="text-xs text-amber">No supplier chosen: every selected product will end up with no supplier.</p>}
              </>
            )}
          </div>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !valid} onClick={go}>{busy ? <><Spinner /> Saving…</> : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}

function MoveListModal({ ids, lists, onClose, onDone }: { ids: string[]; lists: ProductMeta["lists"]; onClose: () => void; onDone: (m: string) => void }) {
  const inactive = lists.filter((l) => !l.visible), active = lists.filter((l) => l.visible);
  const [target, setTarget] = useState(inactive[0]?.id ?? "");
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true); setError("");
    const r = await fetch("/api/products/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...(fresh.trim() ? { new_list: fresh } : { list_id: target }) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not move the products");
    onDone(j.moved + " product(s) moved to " + j.list + (j.inactive ? " (inactive)" : ""));
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Move to list" onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <h2 className="text-base font-semibold">Move {ids.length} product(s) to a list</h2>
        <label className="label mt-3" htmlFor="mv-list">List</label>
        <select id="mv-list" className="input" value={target} disabled={!!fresh.trim()} onChange={(e) => setTarget(e.target.value)}>
          {inactive.length > 0 && <optgroup label="Inactive lists">{inactive.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
          <optgroup label="Active lists">{active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
        </select>
        <label className="label mt-3" htmlFor="mv-new">Or a new inactive list</label>
        <input id="mv-new" className="input" placeholder="e.g. Discontinued" maxLength={60} value={fresh} onChange={(e) => setFresh(e.target.value)} />
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || (!fresh.trim() && !target)} onClick={go}>{busy ? <><Spinner /> Moving…</> : "Move"}</button>
        </div>
      </div>
    </div>
  );
}
