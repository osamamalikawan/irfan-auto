"use client";
import { useState } from "react";

export type SupplierOpt = { id: string; name: string };

/** Choose any number of suppliers: chosen ones show as chips, the rest are searched below. */
export default function SupplierPicks({ options, value, onChange }: { options: SupplierOpt[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const chosen = options.filter((o) => value.includes(o.id));
  const word = q.trim().toLowerCase();
  const found = word ? options.filter((o) => !value.includes(o.id) && o.name.toLowerCase().includes(word)).slice(0, 6) : [];
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chosen.map((s) => (
          <button key={s.id} type="button" className="chip chip-on" onClick={() => onChange(value.filter((x) => x !== s.id))} aria-label={"Remove supplier " + s.name}>{s.name} ✕</button>
        ))}
        {!chosen.length && <p className="text-sm text-muted">No supplier linked.</p>}
      </div>
      <input className="input mt-2" placeholder="Search a supplier to add" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search supplier" />
      {found.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
          {found.map((s) => (
            <li key={s.id}><button type="button" className="w-full px-3 py-2 text-left text-sm active:bg-bg" onClick={() => { onChange([...value, s.id]); setQ(""); }}>＋ {s.name}</button></li>
          ))}
        </ul>
      )}
      {word && !found.length && <p className="mt-1 text-xs text-muted">No other supplier matches.</p>}
    </div>
  );
}
