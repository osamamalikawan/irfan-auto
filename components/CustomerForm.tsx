"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { rs } from "@/lib/format";
import { isAdmin } from "@/lib/permissions";
import { useMe } from "./Me";
import { Loading, Spinner } from "./Loading";

type City = { id: string; name: string; areas: { id: string; name: string }[] };
type Group = { id: string; name: string };
type Account = { code: string; status: string; balance: number; remaining: number | null; overdue: number; days: number };

const EMPTY = { name: "", name_ur: "", owner: "", address: "", cnic: "", ntn: "", email: "", credit_limit: "", credit_days: "", invoice_days_limit: "30", area_id: "", route_id: "", opening_balance: "", remarks: "" };

/** A titled block of the form. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 lg:p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** New customer and Edit customer. Edit has an account summary beside the form and tells you when there is something unsaved. */
export default function CustomerForm({ id }: { id?: string }) {
  const router = useRouter();
  const { can, user } = useMe();
  const admin = isAdmin(user);
  const full = can("customers.edit"); // salesmen add customers to their own routes only, without credit terms
  const [cities, setCities] = useState<City[]>([]);
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState(EMPTY);
  const [phones, setPhones] = useState<string[]>([""]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newGroup, setNewGroup] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    fetch("/api/geo").then((r) => r.json()).then((j) => setCities(j.cities ?? [])).catch(() => {});
    fetch("/api/customer-groups").then((r) => r.json()).then((j) => setGroups(j.groups ?? [])).catch(() => {});
    if (!id) fetch("/api/routes").then((r) => r.json()).then((j) => setRoutes(j.routes ?? [])).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!id) return;
    fetch("/api/customers/" + id).then((r) => r.json()).then((d) => {
      if (d.error) return setError(d.error);
      const c = d.customer;
      const nf = { ...EMPTY, name: c.name ?? "", name_ur: c.name_ur ?? "", owner: c.owner ?? "", address: c.address ?? "", cnic: c.cnic ?? "", ntn: c.ntn ?? "", email: c.email ?? "",
        credit_limit: Number(c.credit_limit) ? String(c.credit_limit) : "", credit_days: Number(c.credit_days) ? String(c.credit_days) : "",
        invoice_days_limit: String(c.invoice_days_limit ?? 30), area_id: c.area?.id ?? c.area_id ?? "" };
      const np: string[] = c.phones?.length ? c.phones : [""];
      const ng = new Set<string>((c.groups ?? []).map((g: Group) => g.id));
      setF(nf); setPhones(np); setPicked(ng);
      setBase(JSON.stringify([nf, np.map((p) => p.trim()).filter(Boolean), [...ng].sort()]));
      setAccount({ code: c.code, status: c.status, balance: Number(c.balance), remaining: c.remaining_limit, overdue: Number(c.overdue ?? 0), days: Number(c.invoice_days_limit ?? 0) });
      setLoaded(true);
    }).catch(() => setError("Could not load"));
  }, [id]);

  const cleanPhones = useMemo(() => phones.map((p) => p.trim()).filter(Boolean), [phones]);
  const now = JSON.stringify([f, cleanPhones, [...picked].sort()]);
  const dirty = !!id && loaded && now !== base;
  useEffect(() => {
    if (!dirty || busy) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, busy]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body: Record<string, unknown> = { ...f, phones: cleanPhones };
    if (full) body.group_ids = [...picked];
    if (!admin) delete body.invoice_days_limit;
    if (id) { delete body.route_id; delete body.opening_balance; delete body.remarks; }
    const r = await fetch(id ? "/api/customers/" + id : "/api/customers", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error || "Could not save"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBase(now);
    router.replace("/customers/" + (id ?? j.id));
    router.refresh();
  }

  const togglePick = (gid: string) => setPicked((s) => { const n = new Set(s); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });
  async function addGroup() {
    const name = newGroup.trim();
    if (!name) return;
    const r = await fetch("/api/customer-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not add the group");
    setGroups((g) => [...g, j.group].sort((a, b) => a.name.localeCompare(b.name)));
    setPicked((s) => new Set(s).add(j.group.id));
    setNewGroup("");
  }
  const makeMain = (i: number) => setPhones((ps) => { const n = [...ps]; [n[0], n[i]] = [n[i], n[0]]; return n; });

  const L = (label: string, htmlFor: string, input: React.ReactNode, hint?: string) => (
    <div><label className="label" htmlFor={htmlFor}>{label}</label>{input}{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</div>
  );
  const canSave = !busy && loaded && !!f.name.trim() && (id ? dirty : full || !!f.route_id);
  const title = id ? (f.name.trim() || "Edit customer") : "New customer";

  return (
    <form onSubmit={save} className="lg:max-w-6xl">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-5">
        <Link href={id ? "/customers/" + id : "/customers"} className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back without saving">←</Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{id ? "Edit customer" : "Customers"}</p>
          <h1 className="truncate text-base font-bold leading-tight lg:text-xl">{title}</h1>
        </div>
        {dirty && <span className="pill hidden bg-amber-bg text-amber sm:inline-flex">Unsaved changes</span>}
        <Link href={id ? "/customers/" + id : "/customers"} className="btn hidden lg:inline-flex">Cancel</Link>
        <button className="btn btn-primary" disabled={!canSave}>{busy ? <><Spinner /> Saving…</> : id ? "Save changes" : "Add customer"}</button>
      </header>

      <div className="space-y-4 p-3 lg:px-5">
        {!loaded && !error && <Loading />}
        {error && <p role="alert" className="rounded-lg bg-red-bg p-3 text-sm text-red">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-4">
            <Section title="Business">
              {L("Business name *", "c-name", <input id="c-name" className="input" required value={f.name} onChange={set("name")} />)}
              {L("Business name (Urdu)", "c-ur", <input id="c-ur" className="input ur" dir="rtl" value={f.name_ur} onChange={set("name_ur")} />)}
              <div className="grid gap-3 sm:grid-cols-2">
                {L("Owner", "c-owner", <input id="c-owner" className="input" value={f.owner} onChange={set("owner")} />)}
                {L("Email", "c-email", <input id="c-email" className="input" type="email" value={f.email} onChange={set("email")} />)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {L("CNIC", "c-cnic", <input id="c-cnic" className="input" inputMode="numeric" value={f.cnic} onChange={set("cnic")} />)}
                {L("NTN", "c-ntn", <input id="c-ntn" className="input" value={f.ntn} onChange={set("ntn")} />)}
              </div>
            </Section>

            <Section title="Contact" hint="The main number is the one printed and used for calls. Search finds a customer by any of the numbers.">
              <div className="space-y-2">
                {phones.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input id={"c-phone-" + i} className="input" type="tel" inputMode="tel" placeholder={i === 0 ? "Main number" : "Another number"} value={p}
                      onChange={(e) => setPhones((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} aria-label={i === 0 ? "Main mobile number" : "Mobile number " + (i + 1)} />
                    {i === 0
                      ? <span className="pill shrink-0 bg-green-bg text-green">Main</span>
                      : <button type="button" className="btn min-h-9 shrink-0 px-2 text-[13px]" onClick={() => makeMain(i)}>Make main</button>}
                    {phones.length > 1 && <button type="button" className="btn min-h-9 shrink-0 px-2.5" onClick={() => setPhones((ps) => ps.filter((_, j) => j !== i))} aria-label={"Remove number " + (i + 1)}>✕</button>}
                  </div>
                ))}
                {phones.length < 10 && <button type="button" className="btn w-full" onClick={() => setPhones((ps) => [...ps, ""])}>＋ Add another number</button>}
              </div>
              {L("Address", "c-addr", <textarea id="c-addr" className="input min-h-16 py-2" rows={2} value={f.address} onChange={set("address")} />)}
              {L("City › area", "c-area", (
                <select id="c-area" className="input" value={f.area_id} onChange={set("area_id")}>
                  <option value="">No area</option>
                  {cities.map((c) => <optgroup key={c.id} label={c.name}>{c.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
                </select>
              ))}
              {!id && L(full ? "Route" : "Route *", "c-route", (
                <select id="c-route" className="input" required={!full} value={f.route_id} onChange={set("route_id")}>
                  <option value="">{full ? "No route" : "Choose a route"}</option>
                  {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              ))}
              {id && <p className="text-xs text-muted">To move this customer to another route use “Change route” on the customer page.</p>}
            </Section>

            {!id && (
              <Section title="Notes">
                {L("Remarks (optional)", "c-rem", <textarea id="c-rem" className="input min-h-16 py-2" rows={2} maxLength={500} placeholder="e.g. pays on Fridays, call before visiting" value={f.remarks} onChange={set("remarks")} />)}
              </Section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            {id && account && (
              <section className="card p-4 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Account</h2>
                  <span className="text-xs text-muted">{account.code}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted">Balance</dt><dd className={"font-semibold " + (account.balance > 0 ? "text-red" : "")}>{rs(account.balance)}</dd></div>
                  <div><dt className="text-xs text-muted">Remaining limit</dt><dd className="font-semibold">{account.remaining === null ? "No limit set" : rs(account.remaining)}</dd></div>
                </dl>
                {account.days > 0 && account.overdue > 0 && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-xs text-red">{rs(account.overdue)} is unpaid for more than {account.days} days, so new credit invoices are blocked.</p>}
                {account.status === "archived" && <p className="mt-3 text-xs text-amber">This customer is archived.</p>}
              </section>
            )}

            {full && (
              <Section title="Credit & invoicing">
                <div className="grid grid-cols-2 gap-3">
                  {L("Credit limit (Rs)", "c-limit", <input id="c-limit" className="input" type="number" inputMode="decimal" min="0" value={f.credit_limit} onChange={set("credit_limit")} />)}
                  {L("Credit days", "c-days", <input id="c-days" className="input" type="number" inputMode="numeric" min="0" value={f.credit_days} onChange={set("credit_days")} />)}
                </div>
                <p className="-mt-1 text-xs text-muted">A credit invoice must fit in the remaining limit. 0 or empty means no limit.</p>
                {admin && L("Invoice days limit", "c-invdays", <input id="c-invdays" className="input" type="number" inputMode="numeric" min="0" value={f.invoice_days_limit} onChange={set("invoice_days_limit")} />,
                  "No new credit invoice while an invoice is unpaid for more than this many days (administrators only). 0 turns the check off.")}
                {!id && L("Opening balance (Rs)", "c-open", <input id="c-open" className="input" type="number" inputMode="decimal" value={f.opening_balance} onChange={set("opening_balance")} />, "What the customer already owes. It counts as old debt for the days limit.")}
              </Section>
            )}

            {full && (
              <Section title="Groups" hint="A customer can be in any number of groups.">
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <button key={g.id} type="button" className={"chip " + (picked.has(g.id) ? "chip-on" : "")} aria-pressed={picked.has(g.id)} onClick={() => togglePick(g.id)}>{g.name}</button>
                  ))}
                  {!groups.length && <p className="text-sm text-muted">No groups yet.</p>}
                </div>
                <div className="flex gap-2">
                  <input className="input" placeholder="New group name" maxLength={40} value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }} aria-label="New group name" />
                  <button type="button" className="btn" disabled={!newGroup.trim()} onClick={addGroup}>Add</button>
                </div>
              </Section>
            )}
          </aside>
        </div>
      </div>
    </form>
  );
}
