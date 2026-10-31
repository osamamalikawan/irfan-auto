"use client";
import { useState } from "react";
import { qty as fmt } from "@/lib/format";
import { useMe } from "./Me";
import { Spinner } from "./Loading";

type Loc = { id: string; name: string; qty: number };
type Mode = "receive" | "issue" | "count";
const MODES: [Mode, string][] = [["receive", "Receive +"], ["issue", "Issue −"], ["count", "Set count"]];

export default function AdjustSheet({ productId, unit, locations: allLocations, initialLocation, onClose, onDone }: {
  productId: string; unit: string; locations: Loc[]; initialLocation?: string; onClose: () => void; onDone: () => void;
}) {
  const { user, can } = useMe();
  const locations = allLocations.filter((l) => !user.locationIds || user.locationIds.includes(l.id));
  const modes = MODES.filter(([k]) => (k === "receive" ? can("stock.restock") || can("stock.manage") : can("stock.adjust") || can("stock.manage")));
  const [mode, setMode] = useState<Mode>(modes[0]?.[0] ?? "receive");
  const [loc, setLoc] = useState(initialLocation && locations.some((l) => l.id === initialLocation) ? initialLocation : locations[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cur = locations.find((l) => l.id === loc)?.qty ?? 0;
  const n = Number(value);
  const delta = mode === "count" ? n - cur : mode === "issue" ? -n : n;
  const valid = value !== "" && Number.isFinite(n) && n >= 0 && delta !== 0 && !!loc;

  async function save() {
    setBusy(true); setError("");
    const body = mode === "count"
      ? { location_id: loc, type: "adjust", qty: delta, note: note || "Stock count" }
      : { location_id: loc, type: mode, qty: n, note };
    const r = await fetch("/api/inventory/products/" + productId + "/adjust", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Change stock">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <div className="mb-3 grid grid-flow-col auto-cols-fr gap-2">
          {modes.map(([k, label]) => (
            <button key={k} className={"chip justify-center " + (mode === k ? "chip-on" : "")} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>
        <label className="label" htmlFor="adj-loc">Location</label>
        <select id="adj-loc" className="input mb-3" value={loc} onChange={(e) => setLoc(e.target.value)}>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name} (now {fmt(l.qty)})</option>)}
        </select>
        <label className="label" htmlFor="adj-qty">{mode === "count" ? "Counted quantity" : "Quantity"} ({unit})</label>
        <input id="adj-qty" className="input mb-1 text-2xl font-semibold" inputMode="decimal" type="number" min="0" step="any" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        <p className="mb-3 h-5 text-sm text-muted">
          {valid ? "New total here: " + fmt(cur + delta) + " (" + (delta > 0 ? "+" : "") + fmt(delta) + ")" : mode === "count" && value !== "" && delta === 0 ? "Matches the system count." : ""}
        </p>
        <input className="input mb-3" placeholder="Note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="mb-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={save}>{busy ? <><Spinner /> Saving…</> : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
