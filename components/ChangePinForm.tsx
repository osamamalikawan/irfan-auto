"use client";
import { useState } from "react";
import { pinError } from "@/lib/pin";
import { Spinner } from "./Loading";

export default function ChangePinForm({ forced }: { forced?: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const bad = pinError(next);
    if (bad) return setError(bad);
    if (next !== again) return setError("The two new PINs do not match.");
    setBusy(true);
    const r = await fetch("/api/auth/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not change the PIN");
    if (forced) return window.location.replace("/");
    setDone(true); setCurrent(""); setNext(""); setAgain("");
  }

  const field = "input text-center text-xl tracking-[0.4em]";
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      {forced && <p className="rounded-lg bg-amber-bg p-2 text-sm text-amber">Please choose your own PIN before you continue.</p>}
      <div><label className="label" htmlFor="cp-cur">Current PIN</label><input id="cp-cur" className={field} type="password" inputMode="numeric" maxLength={8} required value={current} onChange={digits(setCurrent)} /></div>
      <div><label className="label" htmlFor="cp-new">New PIN (4 to 8 digits)</label><input id="cp-new" className={field} type="password" inputMode="numeric" maxLength={8} required value={next} onChange={digits(setNext)} /></div>
      <div><label className="label" htmlFor="cp-again">New PIN again</label><input id="cp-again" className={field} type="password" inputMode="numeric" maxLength={8} required value={again} onChange={digits(setAgain)} /></div>
      {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      {done && <p role="status" className="rounded-lg bg-green-bg p-2 text-sm text-green">PIN changed.</p>}
      <button className="btn btn-primary w-full" disabled={busy || current.length < 4 || next.length < 4}>{busy ? <><Spinner /> Saving…</> : "Change PIN"}</button>
    </form>
  );
}
