"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AddLocationModal from "./AddLocationModal";
import AdjustSheet from "./AdjustSheet";
import Toast from "./Toast";
import { qty, rs, stockTone, toneClass } from "@/lib/format";
import { normalizeQuery } from "@/lib/voice";
import { useVoiceSearch, type VoiceLang } from "@/lib/useVoiceSearch";

type Loc = { location: string; qty: number; racks: string[] };
type Item = {
  id: string; legacy_no: number | null; name_en: string; code_name: string | null; name_ur: string | null;
  scheme: string | null; cp: number; unit: string; reorder_level: number; list_name: string | null; brand: string | null;
  on_hand: number; racks: string[]; locations: string[]; by_location: Loc[];
};
type MetaLoc = { id: string; name: string };
const FILTER_LABEL: Record<string, string> = { low: "Low stock", out: "Out of stock", norack: "No rack" };
const PAGE = 30;

export default function InventoryList({ initialFilter }: { initialFilter: string }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const filter = initialFilter;
  const [list, setList] = useState("");
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [locs, setLocs] = useState<MetaLoc[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restock, setRestock] = useState<Item | null>(null);
  const [addLoc, setAddLoc] = useState(false);
  const [toast, setToast] = useState("");
  const req = useRef(0);
  const [vlang, setVlang] = useState<VoiceLang>("ur-PK");
  const voice = useVoiceSearch((t) => setQ(normalizeQuery(t)));
  useEffect(() => {
    try { const v = localStorage.getItem("voiceLang"); if (v === "en-IN" || v === "ur-PK") setVlang(v); } catch { /* ignore */ }
  }, []);
  const flipLang = () => {
    const n: VoiceLang = vlang === "ur-PK" ? "en-IN" : "ur-PK";
    setVlang(n);
    try { localStorage.setItem("voiceLang", n); } catch { /* ignore */ }
  };

  const loadMeta = useCallback(() => {
    fetch("/api/inventory/meta").then((r) => r.json()).then((m) => { setLists(m.lists ?? []); setLocs(m.locations ?? []); }).catch(() => {});
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    const p = new URLSearchParams({ q, filter, offset: String(offset), limit: String(PAGE) });
    if (list) p.set("list", list);
    try {
      const r = await fetch("/api/inventory/products?" + p);
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load");
      setItems((prev) => (offset ? [...prev, ...j.items] : j.items));
      setTotal(j.total);
    } catch (e) {
      if (id === req.current) setError((e as Error).message);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [q, filter, list]);

  useEffect(() => {
    const t = setTimeout(() => load(0), 250);
    return () => clearTimeout(t);
  }, [load]);

  const qtyAt = (it: Item, name: string) => it.by_location?.find((l) => l.location === name);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pb-0 lg:pt-4">
        <div className="mb-2 flex items-center justify-between lg:hidden">
          <div>
            <h1 className="text-lg font-bold leading-tight">Stock</h1>
            <span className="text-xs text-muted">{loading && !items.length ? "Loading…" : total.toLocaleString() + " items"}</span>
          </div>
          <button className="btn min-h-9 px-3" onClick={() => setAddLoc(true)}>＋ Location</button>
        </div>
        <div className="grid grid-cols-[minmax(0,9.5rem)_1fr] gap-2 lg:flex lg:items-center">
          <Link href="/inventory/new" className="btn btn-primary hidden lg:inline-flex">Add Product</Link>
          <button className="btn hidden lg:inline-flex" onClick={() => setAddLoc(true)}>Add location</button>
          <div className="hidden lg:block lg:flex-1" />
          <select className="input lg:w-56" value={list} onChange={(e) => setList(e.target.value)} aria-label="List">
            <option value="">All lists</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="relative lg:w-80">
            <input className={"input " + (voice.supported ? "pr-28" : "pr-10")} type="text" inputMode="search" enterKeyHint="search"
              placeholder={voice.listening ? "Listening…" : "Find a part: name, Urdu, brand, code or rack"}
              value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a part" />
            <div className="absolute inset-y-0 right-1 flex items-center">
              {q && <button type="button" className="btn min-h-9 border-0 bg-transparent px-2" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
              {voice.supported && (
                <>
                  <button type="button" className="btn min-h-9 border-0 bg-transparent px-2 text-xs" onClick={flipLang} aria-label="Voice language">{vlang === "ur-PK" ? "اردو" : "EN"}</button>
                  <button type="button" className={"btn min-h-9 border-0 bg-transparent px-2 text-lg " + (voice.listening ? "text-red" : "")}
                    onClick={() => (voice.listening ? voice.stop() : voice.start(vlang))} aria-label={voice.listening ? "Stop listening" : "Search by voice"}>
                    {voice.listening ? "⏹" : "🎤"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {voice.error && <p role="alert" className="mt-1 text-sm text-red">{voice.error}</p>}
        {filter !== "all" && (
          <button className="chip chip-on mt-2" onClick={() => router.replace("/inventory")} aria-label={"Clear filter " + FILTER_LABEL[filter]}>
            {FILTER_LABEL[filter]} ✕
          </button>
        )}
      </header>

      {/* ---------- phone: cards ---------- */}
      <ul className="space-y-2 p-3 lg:hidden">
        {items.map((it) => {
          const tone = stockTone(Number(it.on_hand), Number(it.reorder_level));
          return (
            <li key={it.id}>
              <Link href={"/inventory/" + it.id} className="card flex gap-3 p-3 active:opacity-70">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{it.name_en}</p>
                  {it.name_ur && <p className="ur text-sm text-muted">{it.name_ur}</p>}
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted">
                    {it.list_name && <span className="pill bg-bg">{it.list_name}</span>}
                    {it.scheme && <span className="pill bg-bg">Scheme {it.scheme}</span>}
                    {it.racks.map((r) => <span key={r} className="pill bg-bg">Rack {r}</span>)}
                    {!it.racks.length && it.locations.map((l) => <span key={l} className="pill bg-bg">{l}</span>)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={"pill text-base " + toneClass[tone]}>{qty(it.on_hand)}</span>
                  <p className="mt-1 text-xs text-muted">{it.unit}</p>
                  <p className="mt-1.5 text-sm font-semibold">{rs(it.cp)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ---------- desktop: table like the original screen ---------- */}
      <section className="card mx-5 mt-3 hidden p-3.5 lg:block">
        <h2 className="mb-2.5 text-[15px] font-semibold">Stock and rack locations <span className="font-normal text-muted">· {total.toLocaleString()} items</span></h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[12.5px] text-muted">
                <th className="border-b border-line px-2 py-1.5 font-semibold">Part</th>
                {locs.map((l) => (
                  <th key={l.id} className="whitespace-nowrap border-b border-line px-2 py-1.5 text-right font-semibold">{l.name}<br /><span className="text-xs font-normal">qty · racks</span></th>
                ))}
                <th className="whitespace-nowrap border-b border-line px-2 py-1.5 text-right font-semibold">Total on hand</th>
                <th className="whitespace-nowrap border-b border-line px-2 py-1.5 text-right font-semibold">Price (CP)</th>
                <th className="border-b border-line px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const low = Number(it.reorder_level) > 0 && Number(it.on_hand) <= Number(it.reorder_level);
                return (
                  <tr key={it.id} className="hover:bg-bg">
                    <td className="border-b border-line px-2 py-2 align-middle">
                      <Link href={"/inventory/" + it.id} className="font-semibold hover:underline">{it.name_en}</Link>
                      {it.name_ur && <div className="ur text-[13px] leading-8 text-muted">{it.name_ur}</div>}
                      <div className="text-xs text-muted">{[it.brand, it.list_name, it.scheme && "Scheme " + it.scheme].filter(Boolean).join(" · ") || "—"}</div>
                    </td>
                    {locs.map((l) => {
                      const c = qtyAt(it, l.name);
                      return (
                        <td key={l.id} className="whitespace-nowrap border-b border-line px-2 py-2 text-right align-middle">
                          {c ? qty(c.qty) : "—"}
                          <br /><span className="text-xs font-medium text-muted">{c ? (c.racks.length ? c.racks.join(", ") : "no rack") : ""}</span>
                        </td>
                      );
                    })}
                    <td className={"whitespace-nowrap border-b border-line px-2 py-2 text-right align-middle " + (low ? "font-semibold text-red" : "")}>
                      <b>{qty(it.on_hand)}</b>{low ? " ▼" : ""} <span className="text-xs font-normal text-muted">{it.unit}</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right align-middle font-semibold">{rs(it.cp)}</td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right align-middle">
                      <Link href={"/inventory/" + it.id} className="btn min-h-8 px-2 text-[13px]">Where is it?</Link>{" "}
                      <button className="btn min-h-8 px-2 text-[13px]" onClick={() => setRestock(it)}>Change stock</button>{" "}
                      <Link href={"/inventory/" + it.id + "/edit"} className="btn min-h-8 px-2 text-[13px]">Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">▼ marks stock at or below the reorder level.</p>
      </section>

      <div className="px-3 pb-6 text-center text-sm text-muted lg:px-5 lg:pt-3">
        {error && <p className="mb-2 text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p>No part matches. Try a name, Urdu name, brand, code or rack number.</p>}
        {items.length < total && (
          <button className="btn w-full lg:w-auto" disabled={loading} onClick={() => load(items.length)}>
            {loading ? "Loading…" : "Load more (" + (total - items.length).toLocaleString() + " left)"}
          </button>
        )}
      </div>

      <Link href="/inventory/new" aria-label="Add product"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-accent text-3xl text-accent-ink shadow-lg active:opacity-80 lg:hidden">＋</Link>

      {addLoc && <AddLocationModal onClose={() => setAddLoc(false)} onDone={(n) => { setAddLoc(false); setToast(n + " added"); loadMeta(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}

      {restock && (
        <AdjustSheet productId={restock.id} unit={restock.unit}
          locations={locs.map((l) => ({ id: l.id, name: l.name, qty: qtyAt(restock, l.name)?.qty ?? 0 }))}
          onClose={() => setRestock(null)} onDone={() => { setRestock(null); load(0); }} />
      )}
    </div>
  );
}
