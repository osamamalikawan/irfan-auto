"use client";
import { useCallback, useEffect, useState } from "react";
import { PERM_GROUPS } from "@/lib/permissions";
import Toast from "./Toast";

type Role = { id: string; name: string; perms: string[]; own_only: boolean; system: boolean };
type User = {
  id: string; name: string; role_id: string; role_name: string; active: boolean; location_ids: string[] | null;
  is_salesman: boolean; target_sales: number; target_collection: number; target_visits: number;
  locked: boolean; last_login_at: string | null; must_change_pin: boolean;
};
type Loc = { id: string; name: string };

const overlay = "fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center";
const panel = "mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4";

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true as const } : { ok: false as const, error: (j.error as string) || "Could not save" };
}

export default function UsersView() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [error, setError] = useState("");
  const [editU, setEditU] = useState<User | "new" | null>(null);
  const [editR, setEditR] = useState<Role | "new" | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [u, r, l] = await Promise.all([fetch("/api/users"), fetch("/api/roles"), fetch("/api/inventory/locations")]);
    const [uj, rj, lj] = await Promise.all([u.json(), r.json(), l.json()]);
    if (!u.ok) return setError(uj.error || "Could not load users");
    if (!r.ok) return setError(rj.error || "Could not load roles");
    setUsers(uj.users); setRoles(rj.roles); setLocs(l.ok ? lj.locations : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const locName = (ids: string[] | null) => (ids ? ids.map((i) => locs.find((l) => l.id === i)?.name ?? "?").join(", ") : "All locations");

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 flex items-center justify-between lg:hidden"><h1 className="text-lg font-bold">Users &amp; Roles</h1></div>
        <div className="flex items-center gap-2">
          <button className={"chip " + (tab === "users" ? "chip-on" : "")} onClick={() => setTab("users")}>Users</button>
          <button className={"chip " + (tab === "roles" ? "chip-on" : "")} onClick={() => setTab("roles")}>Roles</button>
          <div className="flex-1" />
          <button className="btn btn-primary min-h-9" onClick={() => (tab === "users" ? setEditU("new") : setEditR("new"))}>{tab === "users" ? "Add user" : "Add role"}</button>
        </div>
      </header>

      <div className="p-3 lg:p-5">
        {error && <p className="mb-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!users && !error && <p className="text-sm text-muted">Loading…</p>}

        {tab === "users" && users && (
          <ul className="grid gap-2 lg:grid-cols-2">
            {users.map((u) => (
              <li key={u.id}>
                <button className="card w-full p-3 text-left active:opacity-70" onClick={() => setEditU(u)}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{u.name}</span>
                    <span className="pill bg-bg text-muted">{u.role_name}</span>
                    {u.is_salesman && <span className="pill bg-green-bg text-green">Salesman</span>}
                    <span className="flex-1" />
                    {!u.active && <span className="pill bg-red-bg text-red">Inactive</span>}
                    {u.locked && <span className="pill bg-amber-bg text-amber">Locked</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{locName(u.location_ids)}</p>
                  <p className="text-xs text-muted">{u.must_change_pin ? "Has not chosen a PIN yet" : u.last_login_at ? "Last sign-in " + new Date(u.last_login_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "Never signed in"}</p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === "roles" && roles && (
          <ul className="grid gap-2 lg:grid-cols-2">
            {roles.map((r) => (
              <li key={r.id}>
                <button className="card w-full p-3 text-left active:opacity-70 disabled:opacity-100" disabled={r.system} onClick={() => setEditR(r)}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    {r.own_only && <span className="pill bg-bg text-muted">Own customers only</span>}
                    <span className="flex-1" />
                    <span className="text-xs text-muted">{r.perms.includes("*") ? "Everything" : r.perms.length + " permissions"}</span>
                  </div>
                  {r.system && <p className="mt-1 text-xs text-muted">Built in. Cannot be changed.</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editU && roles && <UserForm user={editU === "new" ? null : editU} roles={roles} locs={locs} onClose={() => setEditU(null)}
        onSaved={(m) => { setEditU(null); setToast(m); load(); }} />}
      {editR && <RoleForm role={editR === "new" ? null : editR} onClose={() => setEditR(null)} onSaved={(m) => { setEditR(null); setToast(m); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function UserForm({ user, roles, locs, onClose, onSaved }: { user: User | null; roles: Role[]; locs: Loc[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [roleId, setRoleId] = useState(user?.role_id ?? roles.find((r) => !r.system)?.id ?? roles[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(user?.active ?? true);
  const [allLocs, setAllLocs] = useState(!user?.location_ids);
  const [locIds, setLocIds] = useState<string[]>(user?.location_ids ?? []);
  const [sm, setSm] = useState(user?.is_salesman ?? false);
  const [tSales, setTSales] = useState(String(user?.target_sales || ""));
  const [tColl, setTColl] = useState(String(user?.target_collection || ""));
  const [tVis, setTVis] = useState(String(user?.target_visits || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body: Record<string, unknown> = {
      name, role_id: roleId, active, is_salesman: sm,
      location_ids: allLocs ? null : locIds,
      target_sales: sm ? tSales : 0, target_collection: sm ? tColl : 0, target_visits: sm ? tVis : 0,
    };
    if (pin) body.pin = pin;
    const r = user ? await send("/api/users/" + user.id, "PATCH", body) : await send("/api/users", "POST", { ...body, pin });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(user ? "Saved" : name + " added");
  }

  async function unlock() {
    if (!user) return;
    const r = await send("/api/users/" + user.id, "PATCH", { unlock: true });
    if (!r.ok) return setError(r.error);
    onSaved(user.name + " unlocked");
  }

  return (
    <div className={overlay} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={user ? "Edit user" : "Add user"} className={panel}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">{user ? "Edit user" : "Add user"}</h2>
        <div className="space-y-3">
          <div><label className="label" htmlFor="u-name">Name</label><input id="u-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <label className="label" htmlFor="u-role">Role</label>
            <select id="u-role" className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-pin">{user ? "New PIN (leave empty to keep)" : "Starting PIN (4 to 8 digits)"}</label>
            <input id="u-pin" className="input tracking-widest" inputMode="numeric" maxLength={8} autoComplete="off" required={!user} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <p className="mt-1 text-xs text-muted">The person is asked to choose their own PIN at the next sign-in.</p>
          </div>

          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (can sign in)</label>

          <div>
            <p className="label">Locations this person may work at</p>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={allLocs} onChange={(e) => setAllLocs(e.target.checked)} /> All locations</label>
            {!allLocs && (
              <div className="grid grid-cols-2 gap-1">
                {locs.map((l) => (
                  <label key={l.id} className="flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-5" checked={locIds.includes(l.id)} onChange={(e) => setLocIds((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} /> {l.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={sm} onChange={(e) => setSm(e.target.checked)} /> This person is a salesman</label>
          {sm && (
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label" htmlFor="u-ts">Sales target (Rs)</label><input id="u-ts" className="input" type="number" inputMode="decimal" min="0" value={tSales} onChange={(e) => setTSales(e.target.value)} /></div>
              <div><label className="label" htmlFor="u-tc">Collection (Rs)</label><input id="u-tc" className="input" type="number" inputMode="decimal" min="0" value={tColl} onChange={(e) => setTColl(e.target.value)} /></div>
              <div><label className="label" htmlFor="u-tv">Visits</label><input id="u-tv" className="input" type="number" inputMode="numeric" min="0" value={tVis} onChange={(e) => setTVis(e.target.value)} /></div>
            </div>
          )}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2 lg:justify-end">
          {user?.locked && <button type="button" className="btn" onClick={unlock}>Unlock</button>}
          <button type="button" className="btn flex-1 lg:flex-none" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-1 lg:flex-none" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function RoleForm({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [ownOnly, setOwnOnly] = useState(role?.own_only ?? false);
  const [perms, setPerms] = useState<string[]>(role?.perms ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (k: string, on: boolean) => setPerms((s) => (on ? [...s, k] : s.filter((x) => x !== k)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body = { name, perms, own_only: ownOnly };
    const r = role ? await send("/api/roles/" + role.id, "PATCH", body) : await send("/api/roles", "POST", body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(role ? "Saved" : name + " added");
  }

  return (
    <div className={overlay} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={role ? "Edit role" : "Add role"} className={panel}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">{role ? "Edit role" : "Add role"}</h2>
        <div className="space-y-3">
          <div><label className="label" htmlFor="r-name">Role name</label><input id="r-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={ownOnly} onChange={(e) => setOwnOnly(e.target.checked)} /> Sees only their own customers and sales</label>
          {PERM_GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend className="label">{g.title}</legend>
              {g.perms.map(([k, label]) => (
                <label key={k} className="flex min-h-10 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5" checked={perms.includes(k)} onChange={(e) => toggle(k, e.target.checked)} /> {label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
