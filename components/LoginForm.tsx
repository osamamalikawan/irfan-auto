"use client";
import { useEffect, useState } from "react";

export default function LoginForm() {
  const [users, setUsers] = useState<{ id: string; name: string }[] | null>(null);
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/users").then((r) => r.json()).then((j) => {
      if (j.error) return setError(j.error);
      setUsers(j.users);
      try { const last = localStorage.getItem("lastUser"); if (last && j.users.some((u: { id: string }) => u.id === last)) setUserId(last); } catch { /* ignore */ }
      if (!j.users.length) setError("No users found. Run the 0004_users_roles.sql migration.");
    }).catch(() => setError("Cannot reach the server."));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, pin }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setPin(""); return setError(j.error || "Could not sign in"); }
    try { localStorage.setItem("lastUser", userId); } catch { /* ignore */ }
    const next = new URLSearchParams(window.location.search).get("next") || "/inventory";
    // full navigation so the new cookie is used everywhere
    window.location.replace(j.mustChangePin ? "/change-pin" : next.startsWith("/") && !next.startsWith("//") ? next : "/inventory");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-5 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-accent-ink">IA</div>
        <h1 className="text-2xl font-bold">Irfan Autos</h1>
        <p className="text-sm text-muted">Bike &amp; auto spare parts</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="lg-user">Who are you?</label>
          <select id="lg-user" className="input" required value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!users}>
            <option value="">{users ? "Choose your name" : "Loading…"}</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lg-pin">PIN</label>
          <input id="lg-pin" className="input text-center text-2xl tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="current-password"
            pattern="[0-9]*" maxLength={8} required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !userId || pin.length < 4}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
