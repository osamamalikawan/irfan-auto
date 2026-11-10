// Reads an Oracle "INSERT INTO" dump (as produced by Open DUMP Viewer) without a database.
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
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

const INSERT = /^INSERT INTO "(\w+)"\."(\w+)" \(([\s\S]*?)\) VALUES \(([\s\S]*)\);\s*$/;

export function parseInsert(statement: string): { table: string; row: Row } | null {
  const m = INSERT.exec(statement);
  if (!m) return null;
  const cols = m[3].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const vals = splitTop(m[4]);
  if (cols.length !== vals.length) {
    throw new Error(`INSERT into ${m[2]} has ${cols.length} columns but ${vals.length} values.`);
  }
  const row: Row = {};
  cols.forEach((c, i) => { row[c] = evalExpr(vals[i] ?? "NULL"); });
  return { table: m[2], row };
}

function statementComplete(statement: string): boolean {
  let quoted = false;
  for (let i = 0; i < statement.length; i++) {
    if (statement[i] === "'") {
      if (quoted && statement[i + 1] === "'") { i++; continue; }
      quoted = !quoted;
    } else if (statement[i] === ";" && !quoted) {
      return statement.slice(i + 1).trim() === "";
    }
  }
  return false;
}

/** Streams only wanted rows from a dump without retaining them in memory. */
export async function* streamOracleDump(path: string, wanted: string[]): AsyncGenerator<{ table: string; row: Row }> {
  const want = new Set(wanted.map((t) => t.toUpperCase()));
  const inputStat = await stat(path);
  const sources = inputStat.isDirectory()
    ? await (async () => {
      const entries = await readdir(path, { withFileTypes: true });
      const files = new Map(entries.filter((entry) => entry.isFile())
        .map((entry) => [entry.name.toUpperCase(), join(path, entry.name)]));
      const missing = [...want].filter((table) => !files.has(`${table}.SQL`));
      if (missing.length) {
        throw new Error(`Oracle dump directory is missing table file(s): ${missing.map((table) => `${table}.sql`).join(", ")}`);
      }
      return [...want].map((table) => ({ table, path: files.get(`${table}.SQL`)! }));
    })()
    : [{ table: null as string | null, path }];

  for (const source of sources) {
    const rl = createInterface({
      input: createReadStream(source.path, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    let statement = "";
    let statementLine = 0;
    let lineNumber = 0;
    for await (const line of rl) {
      lineNumber++;
      if (!statement) {
        if (!line.startsWith("INSERT INTO")) continue;
        const sourceTable = /^INSERT INTO "\w+"\."(\w+)"/.exec(line)?.[1]?.toUpperCase();
        if (source.table && sourceTable !== source.table) {
          throw new Error(`Unexpected INSERT table ${sourceTable ?? "(unrecognized)"} in ${source.path}:${lineNumber}.`);
        }
        const table = source.table ?? sourceTable;
        if (!table) {
          throw new Error(`Could not identify INSERT table in ${source.path}:${lineNumber}.`);
        }
        if (!want.has(table)) continue;
        statementLine = lineNumber;
      }
      statement = statement ? `${statement}\n${line}` : line;
      if (!statementComplete(statement)) continue;
      const parsed = parseInsert(statement);
      if (!parsed) {
        throw new Error(`Could not parse INSERT in ${source.path}:${statementLine}.`);
      }
      yield { table: parsed.table.toUpperCase(), row: parsed.row };
      statement = "";
      statementLine = 0;
    }
    if (statement) {
      throw new Error(`Incomplete INSERT in ${source.path}:${statementLine} at end of file.`);
    }
  }
}

/** Streams requested table files from a directory or requested rows from one combined dump. */
export async function readOracleDump(path: string, wanted: string[]): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const t of wanted) out[t.toUpperCase()] = [];
  for await (const row of streamOracleDump(path, wanted)) out[row.table].push(row.row);
  return out;
}
