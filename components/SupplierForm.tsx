"use client";
import { useState } from "react";
import { Spinner } from "./Loading";

export type SupplierRow = { id: string; name: string; name_ur: string | null; contact: string | null; phone: string | null; phone2: string | null; address: string | null; city: string | null; ntn: string | null; email: string | null; notes: string | null; credit_days: number };

/** Add or edit a supplier (sheet on phone, dialog on desktop). */
export default function SupplierForm({ supplier, onClose, onSaved }: { supplier: SupplierRow | null; onClose: () => void; onSaved: (m: string, id?: string) => void }) {
  const [f, setF] = useState({
    name: supplier?.name ?? "", name_ur: supplier?.name_ur ?? "", contact: supplier?.contact ?? "", phone: supplier?.phone ?? "", phone2: supplier?.phone2 ?? "",
    address: supplier?.address ?? "", city: supplier?.city ?? "", ntn: supplier?.ntn ?? "", email: supplier?.email ?? "", notes: supplier?.notes ?? "",
    credit_days: supplier?.credit_days ? String(supplier.credit_days) : "", opening_balance: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body: Record<string, unknown> = { ...f };
    if (supplier) delete body.opening_balance;
    const r = await fetch(supplier ? "/api/suppliers/" + supplier.id : "/api/suppliers", { method: supplier ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onSaved(supplier ? "Saved" : f.name + " added", supplier?.id ?? j.id);
  }
  const L = (label: string, id: string, input: React.ReactNode) => (<div><label className="label" htmlFor={id}>{label}</label>{input}</div>);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={supplier ? "Edit supplier" : "Add supplier"}
        className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">{supplier ? "Edit supplier" : "Add supplier"}</h2>
        <div className="space-y-3">
          {L("Name *", "sp-name", <input id="sp-name" className="input" required autoFocus value={f.name} onChange={set("name")} />)}
          {L("Name (Urdu)", "sp-ur", <input id="sp-ur" className="input ur" dir="rtl" value={f.name_ur} onChange={set("name_ur")} />)}
          <div className="grid grid-cols-2 gap-3">
            {L("Contact person", "sp-contact", <input id="sp-contact" className="input" value={f.contact} onChange={set("contact")} />)}
            {L("City", "sp-city", <input id="sp-city" className="input" value={f.city} onChange={set("city")} />)}
            {L("Phone", "sp-phone", <input id="sp-phone" className="input" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} />)}
            {L("Second phone", "sp-phone2", <input id="sp-phone2" className="input" type="tel" inputMode="tel" value={f.phone2} onChange={set("phone2")} />)}
            {L("NTN", "sp-ntn", <input id="sp-ntn" className="input" value={f.ntn} onChange={set("ntn")} />)}
            {L("Email", "sp-email", <input id="sp-email" className="input" type="email" value={f.email} onChange={set("email")} />)}
            {L("Credit days", "sp-days", <input id="sp-days" className="input" type="number" inputMode="numeric" min="0" value={f.credit_days} onChange={set("credit_days")} />)}
            {!supplier && L("We already owe (Rs)", "sp-open", <input id="sp-open" className="input" type="number" inputMode="decimal" value={f.opening_balance} onChange={set("opening_balance")} />)}
          </div>
          {L("Address", "sp-addr", <textarea id="sp-addr" className="input min-h-16 py-2" rows={2} value={f.address} onChange={set("address")} />)}
          {L("Notes", "sp-notes", <textarea id="sp-notes" className="input min-h-16 py-2" rows={2} value={f.notes} onChange={set("notes")} />)}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name.trim()}>{busy ? <><Spinner /> Saving…</> : "Save"}</button></div>
      </form>
    </div>
  );
}
