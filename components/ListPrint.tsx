"use client";
import { useEffect, useState } from "react";
import { BUSINESS } from "@/lib/business";

type P = { id: string; name_en: string; name_ur: string | null; code_name: string | null; cp: number; purchase_price?: number; scheme: string | null };
const urdu: React.CSSProperties = { fontFamily: "var(--font-urdu), serif", direction: "rtl" };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const LABEL: Record<string, string> = { name: "Product", ur: "اردو نام", code: "Code", price: "Price", pp: "PP", scheme: "Scheme" };
const WIDTH: Record<string, string> = { name: "minmax(0,1.5fr)", ur: "minmax(0,1fr)", code: "17mm", price: "15mm", pp: "15mm", scheme: "13mm" };

const BODY_MM = 272;   // usable height of an A4 page after the 10 mm margins, with a little spare
const TITLE_MM = 20;   // title block on the first page
const HEAD_MM = 6.5;   // column heading row

/** A4 price list, two vertical columns per page (down the left column, then down the right). Only the chosen columns are printed. */
export default function ListPrint({ listId, cols }: { listId: string; cols: string[] }) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<P[] | null>(null);
  const [error, setError] = useState("");
  const d = new Date();
  const when = String(d.getDate()).padStart(2, "0") + "-" + MONTHS[d.getMonth()] + "-" + String(d.getFullYear()).slice(2);

  useEffect(() => {
    (async () => {
      try {
        const ls = await (await fetch("/api/inventory/lists")).json();
        setName((ls.lists ?? []).find((x: { id: string }) => x.id === listId)?.name ?? "Price list");
        const all: P[] = [];
        for (let off = 0; off < 20000; off += 500) {
          const r = await fetch("/api/inventory/lists/" + listId + "/products?limit=500&offset=" + off);
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Could not load the list");
          all.push(...j.items);
          if (all.length >= j.total || !j.items.length) break;
        }
        setItems(all);
        await document.fonts?.ready;
        setTimeout(() => window.parent.postMessage({ type: "list-print-ready" }, location.origin), 300);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [listId]);

  if (error) return <p className="p-4 text-red">{error}</p>;
  if (!items) return <p className="p-4 text-muted">Preparing…</p>;

  const shown = cols.filter((c) => c !== "pp" || items.some((p) => p.purchase_price !== undefined));
  const rowMm = shown.includes("ur") ? 7 : 5.6;
  const template = shown.map((c) => WIDTH[c]).join(" ");
  const perFirst = Math.max(1, Math.floor((BODY_MM - TITLE_MM - HEAD_MM) / rowMm));
  const perNext = Math.max(1, Math.floor((BODY_MM - HEAD_MM) / rowMm));
  // pages of two columns: [left, right] per page
  const pages: P[][][] = [];
  for (let i = 0; i < items.length; ) {
    const per = pages.length === 0 ? perFirst : perNext;
    const left = items.slice(i, i + per), right = items.slice(i + per, i + 2 * per);
    pages.push([left, right]); i += 2 * per;
  }
  if (!pages.length) pages.push([[], []]);

  const cell = (p: P, c: string) => {
    if (c === "name") return <span key={c} className="truncate font-medium">{p.name_en}</span>;
    if (c === "ur") return <span key={c} className="truncate text-right text-[11px]" style={urdu}>{p.name_ur ?? ""}</span>;
    if (c === "code") return <span key={c} className="truncate text-[10px]">{p.code_name ?? ""}</span>;
    if (c === "price") return <span key={c} className="text-right font-semibold">{Number(p.cp).toLocaleString("en-US")}</span>;
    if (c === "pp") return <span key={c} className="text-right">{Number(p.purchase_price ?? 0).toLocaleString("en-US")}</span>;
    return <span key={c} className="truncate text-[10px] font-semibold">{p.scheme ?? ""}</span>;
  };
  const Column = ({ rows }: { rows: P[] }) => (
    <div className="min-w-0 border border-black">
      <div className="grid items-center gap-x-1.5 border-b border-black bg-gray-100 px-1.5 text-[10px] font-bold" style={{ gridTemplateColumns: template, height: HEAD_MM + "mm" }}>
        {shown.map((c) => <span key={c} className={c === "ur" || c === "price" || c === "pp" ? "text-right" : ""} style={c === "ur" ? urdu : undefined}>{LABEL[c]}</span>)}
      </div>
      {rows.map((p) => (
        <div key={p.id} className="grid items-center gap-x-1.5 overflow-hidden border-b border-gray-400 px-1.5 text-[10.5px]" style={{ gridTemplateColumns: template, height: rowMm + "mm" }}>{shown.map((c) => cell(p, c))}</div>
      ))}
    </div>
  );

  return (
    <div className="min-h-dvh bg-white p-3 text-black print:p-0">
      <style>{`@page { size: A4; margin: 10mm; } @media print { html, body { background: #fff !important; margin: 0 !important; } .lp-page { margin: 0 !important; box-shadow: none !important; } }`}</style>
      {pages.map(([left, right], k) => (
        <div key={k} className="lp-page mx-auto mb-3 max-w-[190mm] overflow-hidden bg-white shadow print:max-w-none" style={{ height: BODY_MM + "mm", breakAfter: k < pages.length - 1 ? "page" : "auto" }}>
          {k === 0 && (
            <div className="flex items-end justify-between border-b-2 border-black pb-1.5" style={{ height: TITLE_MM + "mm" }}>
              <div><p className="text-[20px] font-bold leading-tight">{BUSINESS.name}</p><p className="text-[10px] uppercase">{BUSINESS.address} - {BUSINESS.phone}</p></div>
              <div className="text-right"><p className="text-[17px] font-bold leading-tight">{name}</p><p className="text-[10px]">Price list · {when} · {items.length} items</p></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-[5mm]"><Column rows={left} /><Column rows={right} /></div>
        </div>
      ))}
    </div>
  );
}
