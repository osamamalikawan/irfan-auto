/** The moments a phone reports about location being turned off / on, and how they pair up into "off from 11:20 to 11:45". */
export const EVENT_KINDS = ["location_off", "location_on", "permission_off", "permission_on"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const isEventKind = (x: unknown): x is EventKind => typeof x === "string" && (EVENT_KINDS as readonly string[]).includes(x);

export type EventRow = { user_id: string; user_name: string; attendance_id: string | null; kind: string; at: string };
export type Period = {
  user_id: string; user_name: string; date: string; kind: "location" | "permission";
  from: string; to: string | null; minutes: number; ongoing: boolean;
};

const pkDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/** `shiftEnd`: when each attendance (shift) ended, null while it is still open. A problem still open when the shift ended ends with the shift. */
export function pairEvents(rows: EventRow[], shiftEnd: Map<string, string | null>, now = Date.now()): Period[] {
  const out: Period[] = [];
  const open = new Map<string, EventRow>();
  const make = (o: EventRow, to: string | null): Period => ({
    user_id: o.user_id, user_name: o.user_name, date: pkDate(o.at), kind: o.kind.startsWith("permission") ? "permission" : "location",
    from: o.at, to, minutes: Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(o.at)) / 60000)), ongoing: to === null,
  });
  for (const e of [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const key = e.user_id + "|" + (e.kind.startsWith("permission") ? "permission" : "location");
    if (e.kind.endsWith("_off")) { if (!open.has(key)) open.set(key, e); }
    else { const o = open.get(key); if (o) { out.push(make(o, e.at)); open.delete(key); } }
  }
  for (const o of open.values()) out.push(make(o, o.attendance_id ? shiftEnd.get(o.attendance_id) ?? null : null));
  return out.sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
}
