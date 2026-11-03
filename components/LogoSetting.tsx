"use client";
import { useEffect, useRef, useState } from "react";
import { Loading, Spinner } from "./Loading";

const MAX_W = 384, MAX_H = 160, MAX_CHARS = 230_000;

/** Draws the chosen picture small enough for a receipt, optionally as pure black and white (best for thermal paper). */
async function prepare(file: File, bw: boolean): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That file is not a picture.")); i.src = url; });
    let scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
    for (let tries = 0; tries < 6; tries++) {
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      if (bw) {
        const data = g.getImageData(0, 0, w, h);
        for (let k = 0; k < data.data.length; k += 4) {
          const v = 0.299 * data.data[k] + 0.587 * data.data[k + 1] + 0.114 * data.data[k + 2] >= 165 ? 255 : 0;
          data.data[k] = data.data[k + 1] = data.data[k + 2] = v;
        }
        g.putImageData(data, 0, 0);
      }
      const out = c.toDataURL("image/png");
      if (out.length <= MAX_CHARS) return out;
      scale *= 0.75;
    }
    throw new Error("The picture is too detailed. Use a simpler or smaller logo.");
  } finally { URL.revokeObjectURL(url); }
}

/** Settings: upload the logo that is printed above the shop name on invoices. */
export default function LogoSetting() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bw, setBw] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/settings/logo").then((r) => r.json()).then((j) => setSaved(j.logo ?? null)).catch(() => setSaved(null)); }, []);
  useEffect(() => {
    if (!file) return;
    let live = true;
    prepare(file, bw).then((d) => { if (live) { setDraft(d); setError(""); } }).catch((e: Error) => { if (live) { setDraft(null); setError(e.message); } });
    return () => { live = false; };
  }, [file, bw]);

  async function call(method: "PUT" | "DELETE") {
    setBusy(true); setError("");
    const r = await fetch("/api/settings/logo", { method, headers: { "Content-Type": "application/json" }, body: method === "PUT" ? JSON.stringify({ logo: draft }) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the logo");
    setSaved(method === "PUT" ? draft : null); setDraft(null); setFile(null);
    if (input.current) input.current.value = "";
  }

  const shown = draft ?? saved;
  return (
    <div>
      {saved === undefined && <Loading />}
      {saved !== undefined && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-56 items-center justify-center rounded-xl border border-dashed border-line bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shown ? <img src={shown} alt="Logo preview" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-gray-500">No logo yet</span>}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a logo picture" className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={bw} onChange={(e) => setBw(e.target.checked)} />Black and white (prints sharper on thermal paper)</label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary min-h-9" disabled={!draft || busy} onClick={() => call("PUT")}>{busy ? <><Spinner /> Saving…</> : "Save logo"}</button>
              {saved && !draft && <button className="btn min-h-9" disabled={busy} onClick={() => call("DELETE")}>Remove logo</button>}
              {draft && <button className="btn min-h-9" onClick={() => { setDraft(null); setFile(null); if (input.current) input.current.value = ""; }}>Cancel</button>}
            </div>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
    </div>
  );
}
