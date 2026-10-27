// Reads an Oracle "INSERT INTO" dump (as produced by Open DUMP Viewer) without a database.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type Val = string | number | null;
export type Row = Record<string, Val>;

/** Splits "a, 'b,c', TO_DATE('x', 'y')" on top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let cur = "", q = false, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      if (q && s[i + 1] === "'") { cur += "''"; i++; continue; }
      q = !q;
    } else if (!q) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

export function evalExpr(raw: string): Val {
  const e = raw.trim();
  if (e === "" || e.toUpperCase() === "NULL") return null;
  if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(e)) return Number(e);
  if (/^TO_DATE\(/i.test(e)) {
    const m = /'(\d{4})\/(\d\d)\/(\d\d)(?: (\d\d):(\d\d):(\d\d))?'/.exec(e);
    return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}` : null;
  }
  if (/^(HEXTORAW|EMPTY_|UTL_RAW)/i.test(e)) return null; // pictures and other binary values are not imported
  // 'text' || CHR(10) || N'more'
  let out = "", i = 0, ok = false;
  while (i < e.length) {
    const c = e[i];
    if (c === " " || c === "|") { i++; continue; }
    if (c === "'" || ((c === "N" || c === "n") && e[i + 1] === "'")) {
      if (c !== "'") i++;
      i++;
      let s = "";
      while (i < e.length) {
        if (e[i] === "'") { if (e[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
        s += e[i++];
      }
      out += s; ok = true; continue;
    }
    const m = /^CHR\((\d+)\)/i.exec(e.slice(i));
    if (m) { out += String.fromCharCode(+m[1]); i += m[0].length; ok = true; continue; }
    return null; // unknown token (e.g. a LONG placeholder)
  }
  return ok && out !== "" ? out : null; // Oracle treats '' as NULL
}

const INSERT = /^INSERT INTO "(\w+)"\."(\w+)" \((.*?)\) VALUES \((.*)\);\s*$/;

export function parseInsert(line: string): { table: string; row: Row } | null {
  const m = INSERT.exec(line);
  if (!m) return null;
  const cols = m[3].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const vals = splitTop(m[4]);
  const row: Row = {};
  cols.forEach((c, i) => { row[c] = evalExpr(vals[i] ?? "NULL"); });
  return { table: m[2], row };
}

/** Streams the file and keeps only the wanted tables (so a huge dump does not fill memory). */
export async function readOracleDump(path: string, wanted: string[]): Promise<Record<string, Row[]>> {
  const want = new Set(wanted.map((t) => t.toUpperCase()));
  const out: Record<string, Row[]> = {};
  for (const t of want) out[t] = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.startsWith("INSERT INTO")) continue;
    const t = /^INSERT INTO "\w+"\."(\w+)"/.exec(line)?.[1]?.toUpperCase();
    if (!t || !want.has(t)) continue;
    const p = parseInsert(line);
    if (p) out[t].push(p.row);
  }
  return out;
}
