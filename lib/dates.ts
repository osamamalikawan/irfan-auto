/** Dates are kept as YYYY-MM-DD in Pakistan time (the shop's day). */
export const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekStart = (iso: string) => addDays(iso, -((new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7)); // Monday
export const monthStart = (iso: string) => iso.slice(0, 8) + "01";
export const niceDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
