"use client";
import { useState } from "react";
import { rackCodes, rackPrefix } from "@/lib/placement";

const TYPES = ["Shop", "Godown", "Warehouse", "Damaged stock"];

/** Popup like the prototype's "Add stock location": name, type, number of racks, rack prefix. */
export default function AddLocationModal({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Godown");
  const [racks, setRacks] = useState("10");
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const n = parseInt(racks || "0", 10);
  const pre = prefix.trim() || (name.trim() ? rackPrefix(name.trim()) : "");
  const preview = pre && n > 0 && n <= 500 ? (() => { const c = rackCodes(pre, n); return n === 1 ? c[0] : c[0] + " to " + c[c.length - 1]; })() : "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/inventory/locations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, racks: n || 0, prefix }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not add the location");
    onDone(j.name);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add stock location"
        className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add stock location</h2>
          <button type="button" className="btn border-0 px-3 text-xl" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor="loc-name">Name</label>
            <input id="loc-name" className="input" required autoFocus placeholder="e.g. Godown 3" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="loc-type">Type</label>
            <select id="loc-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="loc-racks">Number of racks</label>
            <input id="loc-racks" className="input" type="number" inputMode="numeric" min={0} max={500} value={racks} onChange={(e) => setRacks(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="loc-prefix">Rack prefix (optional)</label>
            <input id="loc-prefix" className="input" maxLength={6} placeholder="auto, e.g. G3-" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">Racks are numbered 01, 02, 03…{preview ? " Yours will be " + preview + "." : ""}</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add location"}</button>
        </div>
      </form>
    </div>
  );
}
