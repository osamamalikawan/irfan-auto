"use client";
import { useEffect, useState } from "react";
import { BUSINESS } from "@/lib/business";

type P = { id: string; name_en: string; name_ur: string | null; code_name: string | null; cp: number; scheme: string | null };
const urdu: React.CSSProperties = { fontFamily: "var(--font-urdu), serif", direction: "rtl", lineHeight: 1.8 };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** A4 price list sheet: every active part of one list. Header row repeats on each page. */
export default function ListPrint({ listId }: { listId: string }) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<P[] | null>(null);
  const [error, setError] = useState("");
  const d = new Date();
  const when = String(d.getDate()).padStart(2, "0") + "-" + MONTHS[d.getMonth()] + "-" + String(d.getFullYear()).slice(2);

  useEffect(() => {
    (async () => {
      try {
        const ls = await (await fetch("/api/inventory/lists")).json();
        const l = (ls.lists ?? []).find((x: { id: string }) => x.id === listId);
        setName(l?.name ?? "Price list");
        const all: P[] = [];
        for (let off = 0; off < 5000; off += 100) {
          const r = await fetch("/api/inventory/products?list=" + listId + "&limit=100&offset=" + off);
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
  const th = "border border-black bg-gray-100 px-2 py-1 text-left text-[11px] font-semibold";
  const td = "border border-black px-2 py-0.5 text-[12px]";
  return (
    <div className="min-h-dvh bg-white p-4 text-black">
      <style>{`@page { size: A4; margin: 10mm; } @media print { html, body { background: #fff !important; } thead { display: table-header-group; } tr { break-inside: avoid; } }`}</style>
      <div className="mb-2 flex items-end justify-between border-b-2 border-black pb-2">
        <div><p className="text-[22px] font-bold leading-tight">{BUSINESS.name}</p><p className="text-[11px] uppercase">{BUSINESS.address} - {BUSINESS.phone}</p></div>
        <div className="text-right"><p className="text-[18px] font-bold">{name}</p><p className="text-[11px]">Price list · {when} · {items.length} items</p></div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr><th className={th + " w-10 text-center"}>#</th><th className={th}>Product</th><th className={th + " text-right"}>اردو نام</th><th className={th + " w-24"}>Code</th><th className={th + " w-20 text-right"}>Price</th><th className={th + " w-20"}>Scheme</th></tr></thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={p.id}>
              <td className={td + " text-center"}>{i + 1}</td><td className={td}>{p.name_en}</td>
              <td className={td + " text-right"} style={urdu}>{p.name_ur ?? ""}</td><td className={td}>{p.code_name ?? ""}</td>
              <td className={td + " text-right font-semibold"}>{Number(p.cp).toLocaleString("en-US")}</td><td className={td + " font-semibold"}>{p.scheme ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
