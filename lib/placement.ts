// Pure helpers (no DB). Used by the Excel importer and the API.

export type Placement = { location: string; racks: string[] }[];
export const DEFAULT_LOCATION = "Main";

/** "A1, A2 ،B3;  a1" -> ["A1","A2","B3"]  (comma, Urdu comma, semicolon, newline; de-duplicated). */
export function splitList(s: unknown): string[] {
  if (s == null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of String(s).split(/[,،;\n]/)) {
    const v = t.trim().replace(/\s+/g, " ");
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

/**
 * Turns the sheet's two comma-separated cells into location -> racks.
 *  - one location: every rack goes there
 *  - same number of locations and racks: paired by position ("G1, M" + "G1-03, M-02")
 *  - otherwise ambiguous: all racks go to the first location and a warning is returned
 *  - racks but no location: they go to the "Main" location (warning)
 */
export function pairPlacement(locationsRaw: unknown, racksRaw: unknown): { placement: Placement; warning?: string } {
  let locs = splitList(locationsRaw);
  const racks = splitList(racksRaw);
  if (!locs.length && !racks.length) return { placement: [] };
  let warning: string | undefined;
  if (!locs.length) {
    locs = [DEFAULT_LOCATION];
    warning = "racks but no location; used '" + DEFAULT_LOCATION + "'";
  }
  if (locs.length === 1) return { placement: [{ location: locs[0], racks }], warning };
  if (racks.length === locs.length) return { placement: locs.map((location, i) => ({ location, racks: [racks[i]] })) };
  const placement: Placement = locs.map((location, i) => ({ location, racks: i === 0 ? racks : [] }));
  return { placement, warning: "could not pair " + racks.length + " racks with " + locs.length + " locations; all racks put under '" + locs[0] + "'" };
}

export function parseScheme(s: unknown): { buy: number | null; free: number | null } {
  const m = /^\s*(\d+)\s*\+\s*(\d+)\s*$/.exec(String(s ?? ""));
  return m ? { buy: +m[1], free: +m[2] } : { buy: null, free: null };
}
