"use client";
import { useEffect, useRef, useState } from "react";
import { useMe } from "./Me";

const ALL: [string, string][] = [["name", "Product"], ["ur", "Urdu name"], ["code", "Code"], ["price", "Price"], ["pp", "PP"], ["scheme", "Scheme"]];
const DEFAULT = ["name", "ur", "price", "scheme"];

/** Preview of a price list as an A4 sheet in a popup. Choose the columns to print; the print dialog opens when the sheet is ready. */
export default function ListPrintModal({ listId, name, onClose }: { listId: string; name: string; onClose: () => void }) {
  const { can } = useMe();
  const canPP = can("stock.manage") || can("purchases.create");
  const [cols, setCols] = useState<string[]>(DEFAULT);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const auto = useRef(true);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("listprint:cols") ?? "null"); if (Array.isArray(s) && s.length) setCols(s.filter((c: string) => ALL.some(([k]) => k === c))); } catch { /* keep the default */ }
  }, []);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== location.origin || e.data?.type !== "list-print-ready") return;
      setReady(true);
      if (auto.current) { auto.current = false; frame.current?.contentWindow?.print(); }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("message", onMsg); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("message", onMsg); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const chosen = cols.filter((c) => c !== "pp" || canPP);
  function toggle(k: string) {
    const next = chosen.includes(k) ? chosen.filter((c) => c !== k) : ALL.map(([x]) => x).filter((x) => x === k || chosen.includes(x));
    if (!next.length) return;
    setReady(false); setCols(next);
    try { localStorage.setItem("listprint:cols", JSON.stringify(next)); } catch { /* not saved */ }
  }
  const src = "/print/list?id=" + listId + "&cols=" + chosen.join(",");
  return (
    <div data-noprint className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-0 lg:p-6">
      <div role="dialog" aria-modal="true" aria-label={"Print " + name} className="flex h-dvh w-full max-w-4xl flex-col overflow-hidden bg-surface lg:h-[92dvh] lg:rounded-2xl">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line p-3">
          <h2 className="mr-auto text-base font-semibold">{name} · A4, two columns</h2>
          <button className="btn btn-primary" disabled={!ready} onClick={() => frame.current?.contentWindow?.print()}>{ready ? "Print" : "Preparing…"}</button>
          <button className="btn" onClick={onClose}>Close</button>
          <fieldset className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <legend className="sr-only">Columns to print</legend>
            <span className="font-semibold">Columns</span>
            {ALL.filter(([k]) => k !== "pp" || canPP).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={chosen.includes(k)} onChange={() => toggle(k)} />{label}</label>
            ))}
          </fieldset>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-gray-200 p-2">
          <iframe ref={frame} key={src} src={src} title={"Price list " + name} className="mx-auto block h-full min-h-[70dvh] w-full max-w-[210mm] bg-white shadow" />
        </div>
      </div>
    </div>
  );
}
