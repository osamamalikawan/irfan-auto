"use client";
import { useEffect, useRef, useState } from "react";

/** Preview of a price list as an A4 sheet in a popup. The print dialog opens when it is ready; Print prints again. */
export default function ListPrintModal({ listId, name, onClose }: { listId: string; name: string; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const auto = useRef(true);
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
  return (
    <div data-noprint className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-0 lg:p-6">
      <div role="dialog" aria-modal="true" aria-label={"Print " + name} className="flex h-dvh w-full max-w-4xl flex-col overflow-hidden bg-surface lg:h-[92dvh] lg:rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h2 className="mr-auto text-base font-semibold">{name} · A4</h2>
          <button className="btn btn-primary" disabled={!ready} onClick={() => frame.current?.contentWindow?.print()}>{ready ? "Print" : "Preparing…"}</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-gray-200 p-2">
          <iframe ref={frame} src={"/print/list?id=" + listId} title={"Price list " + name} className="mx-auto block h-full min-h-[70dvh] w-full max-w-[210mm] bg-white shadow" />
        </div>
      </div>
    </div>
  );
}
