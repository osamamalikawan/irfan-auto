"use client";
import { useCallback, useEffect, useState } from "react";
import { duration, fmtTime, mapLink } from "@/lib/field-ui";
import { Loading, Spinner } from "./Loading";
import Toast from "./Toast";

type Att = { check_in_at: string; in_lat: number; in_lng: number; check_out_at: string | null; out_lat: number | null; out_lng: number | null };
type Fix = { lat: number; lng: number; accuracy: number };
const JSON_HEADERS = { "Content-Type": "application/json" };
const PING_EVERY_MS = 120_000;

/** One reading of the phone's position. */
function getFix(): Promise<Fix> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("This device cannot share its location."));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => rej(new Error(e.code === 1 ? "Location is blocked. Allow location for this app in the phone settings, then try again."
        : e.code === 3 ? "Your location took too long. Go to an open area or turn on GPS, then try again." : "Your location could not be read. Turn on GPS and try again.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  });
}

/** The salesman's start / end of work. While he is on duty and this page stays open it also sends his location every 2 minutes.
 *  A web page cannot track in the background (the phone stops it when the screen locks): the Android app will do that. */
export default function MyDayView() {
  const [att, setAtt] = useState<Att | null>(null);
  const [onDuty, setOnDuty] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/attendance/today");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load your day");
      setAtt(j.attendance); setOnDuty(!!j.on_duty); setError("");
    } catch (e) { setError((e as Error).message); } finally { setReady(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  // keep sending the position while on duty
  useEffect(() => {
    if (!onDuty) return;
    let stop = false;
    async function ping() {
      try {
        const f = await getFix();
        const r = await fetch("/api/location", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ pings: [{ ...f, ts: Date.now() }] }) });
        const j = await r.json().catch(() => ({}));
        if (stop || !r.ok) return;
        if (j.on_duty === false) load();
      } catch { /* the next try is in 2 minutes */ }
    }
    const t = setInterval(ping, PING_EVERY_MS);
    return () => { stop = true; clearInterval(t); };
  }, [onDuty, load]);

  async function go(kind: "start" | "end") {
    if (kind === "end" && !window.confirm("End work for today?")) return;
    setBusy(true); setError("");
    try {
      const f = await getFix();
      const r = await fetch(kind === "start" ? "/api/attendance" : "/api/attendance/check-out", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error || "Could not save");
      setAtt(j.attendance); setOnDuty(!!j.on_duty);
      setToast(kind === "start" ? "Work started. Have a good day." : "Work ended. Thank you.");
    } catch (e) { setError((e as Error).message || "No connection. Try again."); } finally { setBusy(false); }
  }

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold">My day</h1>
        <p className="text-sm text-muted">Start work when you begin. Your place and time are saved for the office.</p>
      </header>
      <div className="mx-auto max-w-md space-y-3 p-3 lg:mx-0 lg:px-5">
        {!ready && <Loading />}
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {ready && (
          <>
            <div className="card p-4 text-center">
              {onDuty && att ? (
                <>
                  <span className="pill bg-green-bg text-green">On duty</span>
                  <p className="mt-2 text-sm">Started <b>{fmtTime(att.check_in_at)}</b> · <a className="underline" href={mapLink(att.in_lat, att.in_lng)} target="_blank" rel="noreferrer">place</a></p>
                  <p className="text-2xl font-bold">{duration(att.check_in_at)}</p>
                  <button className="btn mt-3 w-full border-red bg-red-bg text-red" disabled={busy} onClick={() => go("end")}>{busy ? <><Spinner /> Ending shift…</> : "End work"}</button>
                </>
              ) : att?.check_out_at ? (
                <>
                  <span className="pill bg-bg text-ink">Finished for today</span>
                  <p className="mt-2 text-sm">{fmtTime(att.check_in_at)} to {fmtTime(att.check_out_at)} · {duration(att.check_in_at, att.check_out_at)}</p>
                  <button className="btn mt-3 w-full" disabled={busy} onClick={() => go("start")}>{busy ? <><Spinner /> Starting shift…</> : "Start again"}</button>
                </>
              ) : (
                <>
                  <p className="text-muted">You have not started work today.</p>
                  <button className="btn btn-primary mt-3 min-h-14 w-full text-lg" disabled={busy} onClick={() => go("start")}>{busy ? <><Spinner /> Starting shift…</> : "Start work"}</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
