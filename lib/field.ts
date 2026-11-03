/** Small helpers shared by the field-work routes (attendance, location, requests). */
export const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
export const isDate = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
export const isUuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

/** A real position, or null (blank, not a number, out of range, or the 0,0 "no fix" point). */
export function cleanCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  const a = Number(lat), o = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) return null;
  if (a === 0 && o === 0) return null;
  return { lat: a, lng: o };
}
export const cleanAcc = (x: unknown): number | null => {
  const n = Number(x);
  return x !== null && x !== undefined && x !== "" && Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 10) / 10 : null;
};
export const cleanText = (x: unknown, max: number): string | null => String(x ?? "").trim().slice(0, max) || null;
export const cleanIdem = (x: unknown): string | null => String(x ?? "").trim().slice(0, 80) || null;
/** A number the caller may leave out: blank or invalid gives null. */
export const optNum = (x: unknown): number | null => (x === undefined || x === null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
export const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
