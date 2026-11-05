/** Time and map helpers for the field-team screens (all times shown in Pakistan time). */
const TZ = "Asia/Karachi";
export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "–";
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "–";

/** "just now", "12 min ago", "3 h 5 min ago", "2 days ago" */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " h" + (m % 60 ? " " + (m % 60) + " min" : "") + " ago";
  const d = Math.floor(h / 24);
  return d + (d === 1 ? " day ago" : " days ago");
}
export const minutesSince = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60000)) : Infinity);

/** "8 h 51 min" between two moments (the end defaults to now). */
export function duration(fromIso: string, toIso?: string | null, now = Date.now()): string {
  const m = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : now) - Date.parse(fromIso)) / 60000));
  return Math.floor(m / 60) + " h " + (m % 60) + " min";
}
export const mapLink = (lat: number, lng: number) => "https://www.google.com/maps?q=" + lat + "," + lng;

/** A stretch of time during which a salesman's location was off (see /api/location/events). */
export type OffPeriod = { user_id: string; user_name: string; date: string; kind: "location" | "permission"; from: string; to: string | null; minutes: number; ongoing: boolean };
export function offLabel(p: OffPeriod): string {
  const what = p.kind === "permission" ? "Location permission removed" : "Location turned off";
  const len = p.minutes >= 60 ? Math.floor(p.minutes / 60) + " h " + (p.minutes % 60) + " min" : p.minutes + " min";
  return p.to ? what + " " + fmtTime(p.from) + " to " + fmtTime(p.to) + " (" + len + ")" : what + " at " + fmtTime(p.from) + ", still off (" + len + " so far)";
}
