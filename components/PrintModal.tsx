"use client";
import { useEffect, useRef, useState } from "react";
import type { PrintType } from "./SalePrint";

export const PRINT_TITLES: Record<PrintType, string> = { invoice: "Invoice", gateout: "Gate-out slip", delivery: "Delivery slip" };
export type PrintJob = { ids: string[]; type: PrintType; layout: "roll" | "a4" };

/** Preview of the invoice or slips in a popup. The browser's print dialog opens as soon as it is ready; use Print to print again. */
export default function PrintModal({ job, onClose }: { job: PrintJob; onClose: () => void }) {
  const [layout, setLayout] = useState(job.layout);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const auto = useRef(true);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== location.origin || e.data?.type !== "sale-print-ready") return;
      setReady(true);
      if (auto.current) { auto.current = false; frame.current?.contentWindow?.print(); }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("message", onMsg); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const src = "/print/sales?embed=1&type=" + job.type + "&layout=" + layout + "&ids=" + job.ids.join(",");
  const roll = layout === "roll";
  return (
    <div data-noprint className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-0 lg:p-6">
      <div role="dialog" aria-modal="true" aria-label={PRINT_TITLES[job.type]} className="flex h-dvh w-full max-w-4xl flex-col overflow-hidden bg-surface lg:h-[92dvh] lg:rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h2 className="mr-auto text-base font-semibold">{PRINT_TITLES[job.type]}{job.ids.length > 1 ? "s (" + job.ids.length + ")" : ""} · {roll ? "80mm roll" : "A4"}</h2>
          <button className="btn" onClick={() => { setReady(false); setLayout(roll ? "a4" : "roll"); }}>{roll ? "Show A4" : "Show 80mm"}</button>
          <button className="btn btn-primary" disabled={!ready} onClick={() => frame.current?.contentWindow?.print()}>{ready ? "Print" : "Preparing…"}</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-gray-200 p-2">
          <iframe ref={frame} key={src} src={src} title={PRINT_TITLES[job.type]} className={"mx-auto block h-full min-h-[70dvh] bg-white shadow " + (roll ? "w-[78mm] max-w-full" : "w-full max-w-[210mm]")} />
        </div>
      </div>
    </div>
  );
}
