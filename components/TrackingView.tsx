"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { todayPk } from "@/lib/dates";
import { fmtTime, mapLink, minutesSince, offLabel, timeAgo, type OffPeriod } from "@/lib/field-ui";
import { Loading } from "./Loading";

type Loc = { user_id: string; name: string; lat: number | null; lng: number | null; accuracy: number | null; recorded_at: string | null; battery: number | null; on_duty: boolean; check_in_at: string | null; check_out_at: string | null; location_issue: string | null; issue_since: string | null };
type Pt = { recorded_at: string; lat: number; lng: number; accuracy: number | null; battery: number | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Leaf = any; // the Leaflet map library is loaded from a CDN when this page opens, so it adds nothing to the app bundle

const STALE_MIN = 15;
const GREEN = "#1b8a4a", AMBER = "#d9a400", GREY = "#7a8699", RED = "#c62828";

let leafletReady: Promise<Leaf> | null = null;
function loadLeaflet(): Promise<Leaf> {
  const w = window as unknown as { L?: Leaf };
  if (w.L) return Promise.resolve(w.L);
  if (!leafletReady) {
    leafletReady = new Promise<Leaf>((res, rej) => {
      if (!document.getElementById("leaflet-css")) {
        const l = document.createElement("link");
        l.id = "leaflet-css"; l.rel = "stylesheet"; l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
        document.head.appendChild(l);
      }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = () => res((window as unknown as { L: Leaf }).L);
      s.onerror = () => { leafletReady = null; rej(new Error("The map could not load. Check the internet connection; the list below still works.")); };
      document.head.appendChild(s);
    });
  }
  return leafletReady;
}

const colour = (l: Loc) => (!l.on_duty ? GREY : l.location_issue ? RED : minutesSince(l.recorded_at) > STALE_MIN ? AMBER : GREEN);

export default function TrackingView({ initialUser, initialDate }: { initialUser?: string; initialDate?: string }) {
  const [locs, setLocs] = useState<Loc[] | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<string | null>(initialUser ?? null);
  const [date, setDate] = useState(initialDate ?? todayPk());
  const [trail, setTrail] = useState<Pt[] | null>(null);
  const [periods, setPeriods] = useState<OffPeriod[]>([]);
  const [L, setL] = useState<Leaf>(null);
  const [mapErr, setMapErr] = useState("");
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaf>(null);
  const layer = useRef<Leaf>(null);
  const fitted = useRef("");

  useEffect(() => { loadLeaflet().then(setL).catch((e: Error) => setMapErr(e.message)); }, []);
  useEffect(() => {
    if (!L || !el.current) return;
    const m = L.map(el.current).setView([30.3753, 69.3451], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(m);
    map.current = m; layer.current = L.layerGroup().addTo(m);
    return () => { m.remove(); map.current = null; layer.current = null; fitted.current = ""; };
  }, [L]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tracking");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load locations");
      setLocs(j.items ?? []); setError("");
    } catch (e) { setError((e as Error).message); setLocs((x) => x ?? []); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!sel) { setTrail(null); return; }
    let live = true;
    setTrail(null);
    fetch("/api/tracking/" + sel + "?date=" + date).then((r) => r.json()).then((j) => { if (live) setTrail(j.points ?? []); }).catch(() => { if (live) setTrail([]); });
    return () => { live = false; };
  }, [sel, date]);

  useEffect(() => {
    if (!sel) { setPeriods([]); return; }
    let live = true;
    fetch("/api/location/events?user=" + sel + "&from=" + date + "&to=" + date).then((r) => r.json()).then((j) => { if (live) setPeriods(j.periods ?? []); }).catch(() => { if (live) setPeriods([]); });
    return () => { live = false; };
  }, [sel, date]);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!L || !m || !g || !locs) return;
    g.clearLayers();
    const all: [number, number][] = [];
    for (const l of locs) {
      if (l.lat == null || l.lng == null) continue;
      all.push([l.lat, l.lng]);
      L.circleMarker([l.lat, l.lng], { radius: l.user_id === sel ? 12 : 9, color: "#fff", weight: 2, fillColor: colour(l), fillOpacity: 1 })
        .bindTooltip(l.name, { permanent: true, direction: "top", offset: [0, -8] }).on("click", () => setSel(l.user_id)).addTo(g);
    }
    const line: [number, number][] = sel && trail ? trail.map((p) => [p.lat, p.lng]) : [];
    if (line.length > 1) {
      L.polyline(line, { color: "#1f5fd6", weight: 4, opacity: 0.8 }).addTo(g);
      L.circleMarker(line[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#1f5fd6", fillOpacity: 1 }).bindTooltip("Start " + fmtTime(trail![0].recorded_at)).addTo(g);
    }
    const key = (sel ?? "all") + "|" + date + "|" + (trail ? (trail.length ? "t" : "e") : "x");
    const target = line.length ? line : all;
    if (fitted.current !== key && target.length && (!sel || trail)) { m.fitBounds(target, { padding: [40, 40], maxZoom: 16 }); fitted.current = key; }
  }, [L, locs, sel, trail, date]);

  const chosen = locs?.find((l) => l.user_id === sel) ?? null;
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold lg:hidden">Live map</h1>
        <p className="text-sm text-muted">Where each salesman was last seen. <span style={{ color: GREEN }}>●</span> on duty <span style={{ color: AMBER }}>●</span> no update for {STALE_MIN}+ min <span style={{ color: RED }}>●</span> location turned off <span style={{ color: GREY }}>●</span> off duty. Updates every 30 seconds.</p>
      </header>

      <div className="space-y-3 p-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4 lg:space-y-0 lg:px-5">
        <div className="lg:col-span-2">
          <div ref={el} className="card h-[55dvh] w-full overflow-hidden lg:h-[72dvh]" role="region" aria-label="Map of salesmen" />
          {mapErr && <p role="alert" className="mt-2 rounded-lg bg-amber-bg p-2 text-sm text-amber">{mapErr}</p>}
        </div>

        <section>
          {error && <p role="alert" className="mb-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
          {locs === null && <Loading />}
          {locs && !locs.length && <p className="card p-4 text-sm text-muted">No salesmen yet. Mark a user as a salesman under Employees.</p>}
          <ul className="space-y-2">
            {locs?.map((l) => {
              const stale = l.on_duty && minutesSince(l.recorded_at) > STALE_MIN;
              return (
                <li key={l.user_id}>
                  <button className={"card block w-full p-3 text-left active:opacity-70 " + (l.user_id === sel ? "border-accent" : "")} onClick={() => setSel(l.user_id === sel ? null : l.user_id)}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: colour(l) }} />
                      <p className="flex-1 font-semibold">{l.name}</p>
                      <span className={"pill " + (l.on_duty ? "bg-green-bg text-green" : "bg-bg text-muted")}>{l.on_duty ? "On duty" : l.check_out_at ? "Finished" : "Not started"}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {l.recorded_at ? <>Last seen <b className={stale ? "text-red" : "text-ink"}>{timeAgo(l.recorded_at)}</b> ({fmtTime(l.recorded_at)})</> : "No location received yet"}
                      {l.battery != null && <> · battery {l.battery}%</>}{l.accuracy != null && <> · ±{Math.round(l.accuracy)} m</>}
                    </p>
                    {l.on_duty && l.location_issue
                      ? <p className="text-sm font-semibold text-red">{l.location_issue === "permission_off" ? "Location permission removed" : "Location turned OFF"} since {fmtTime(l.issue_since)}. The phone cannot send its position.</p>
                      : stale && <p className="text-xs text-red">No update for a while. The phone may be off, offline, or the app was closed.</p>}
                  </button>
                  {l.user_id === sel && (
                    <div className="card mt-1 space-y-2 p-3">
                      <div className="flex items-end gap-2">
                        <div className="flex-1"><label className="label" htmlFor="tr-date">Route on</label><input id="tr-date" className="input" type="date" max={todayPk()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
                        {l.lat != null && l.lng != null && <a className="btn" href={mapLink(l.lat, l.lng)} target="_blank" rel="noreferrer">Google Maps</a>}
                      </div>
                      {trail === null ? <Loading label="Loading route…" className="py-2" /> : trail.length
                        ? <p className="text-sm text-muted">{trail.length} points from {fmtTime(trail[0].recorded_at)} to {fmtTime(trail[trail.length - 1].recorded_at)}.</p>
                        : <p className="text-sm text-muted">No route recorded for this day.</p>}
                      {periods.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Location problems on this day</p>
                          {periods.map((p, i) => <p key={i} className="text-sm text-red">{offLabel(p)}</p>)}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {chosen && <button className="btn mt-2 w-full" onClick={() => setSel(null)}>Show everyone</button>}
        </section>
      </div>
    </div>
  );
}
