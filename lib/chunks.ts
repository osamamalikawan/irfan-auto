/** Splits a list so a database "in (...)" filter never gets too long. */
export const chunk = <T,>(a: T[], n = 80): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
