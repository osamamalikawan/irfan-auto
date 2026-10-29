export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const cleanDays = (v: unknown): string[] => (Array.isArray(v) ? DAYS.filter((d) => v.includes(d)) : []);
