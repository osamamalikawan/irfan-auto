"use client";
import { useCallback, useEffect, useState } from "react";
import { Loading, Spinner } from "./Loading";

type M = { id: string; name: string; active: boolean };

/** Settings: add, rename, hide or show payment methods. Hidden methods stay on old payments. */
export default function PaymentMethodsSetting() {
  const [methods, setMethods] = useState<M[] | null>(null);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/payment-methods?all=1");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not load payment methods");
    setMethods(j.methods);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(url: string, method: string, body: object) {
    setBusy(true); setError("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error || "Could not save"); return false; }
    await load();
    return true;
  }

  return (
    <div>
      {!methods && !error && <Loading />}
      {methods && (
        <ul className="divide-y divide-line">
          {methods.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2">
              {edit?.id === m.id ? (
                <>
                  <input className="input min-w-0 flex-1" aria-label="Method name" autoFocus maxLength={40} value={edit.name} onChange={(e) => setEdit({ id: m.id, name: e.target.value })} />
                  <button className="btn btn-primary min-h-9 px-3" disabled={busy || !edit.name.trim()} onClick={async () => { if (await call("/api/payment-methods/" + m.id, "PATCH", { name: edit.name })) setEdit(null); }}>Save</button>
                  <button className="btn min-h-9 px-3" onClick={() => setEdit(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className={"min-w-0 flex-1 " + (m.active ? "font-medium" : "text-muted line-through")}>{m.name}</span>
                  {!m.active && <span className="pill bg-bg text-muted">Hidden</span>}
                  <button className="btn min-h-9 px-3" onClick={() => setEdit({ id: m.id, name: m.name })}>Rename</button>
                  <button className="btn min-h-9 px-3" disabled={busy} onClick={() => call("/api/payment-methods/" + m.id, "PATCH", { active: !m.active })}>{m.active ? "Hide" : "Show"}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <input className="input min-w-0 flex-1" placeholder="New method, for example Meezan Bank" aria-label="New payment method" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary shrink-0" disabled={busy || !name.trim()} onClick={async () => { if (await call("/api/payment-methods", "POST", { name })) setName(""); }}>{busy ? <Spinner /> : "Add"}</button>
      </div>
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
    </div>
  );
}
