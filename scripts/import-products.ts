/**
 * Imports the product sheet into Supabase.
 *   npm run import                      (uses data/products_all_pages_1-106.xlsx)
 *   npm run import -- path/to/file.xlsx
 * Safe to re-run: products are matched on the "#" column (legacy_no); placement is additive;
 * opening stock is only written for products that have none yet.
 */
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../lib/supabase";
import { pairPlacement, parseScheme } from "../lib/placement";

type Row = Record<string, unknown>;
const file = process.argv[2] ?? "data/products_all_pages_1-106.xlsx";
const sb = db();

const g = (r: Row, ...keys: string[]) => {
  for (const k of keys) {
    const f = Object.keys(r).find((x) => x.trim().toLowerCase() === k);
    if (f !== undefined) return r[f];
  }
  return null;
};
const txt = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s || null; };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const chunks = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const check = (label: string, error: { message: string } | null) => { if (error) throw new Error(label + ": " + error.message); };

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    check(table, error);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function lookup(table: "price_lists" | "companies" | "brands", names: string[]) {
  const uniq = [...new Set(names)];
  for (const c of chunks(uniq)) check(table, (await sb.from(table).upsert(c.map((name) => ({ name })), { onConflict: "name" })).error);
  const rows = await fetchAll<{ id: string; name: string }>(table, "id,name");
  return new Map(rows.map((r) => [r.name, r.id]));
}

async function main() {
  const ws = XLSX.read(readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Row>(ws.Sheets[ws.SheetNames[0]], { defval: null });
  const warnings: string[] = [];

  const items = rows.flatMap((r, i) => {
    const name = txt(g(r, "name (english)")) ?? txt(g(r, "code name"));
    if (!name) { warnings.push("row " + (i + 2) + ": no name, skipped"); return []; }
    const legacy = Number(g(r, "#")) || i + 1;
    const { placement, warning } = pairPlacement(g(r, "location", "loaction"), g(r, "rack"));
    if (warning) warnings.push("#" + legacy + " " + name + ": " + warning);
    const scheme = txt(g(r, "scheme"));
    return [{ legacy, name, r, placement, scheme, ...parseScheme(scheme) }];
  });
  console.log("Rows read:", rows.length, "| importable:", items.length);

  const lists = await lookup("price_lists", items.map((x) => txt(g(x.r, "list"))).filter(Boolean) as string[]);
  const companies = await lookup("companies", items.map((x) => txt(g(x.r, "company"))).filter(Boolean) as string[]);
  const brands = await lookup("brands", items.map((x) => txt(g(x.r, "brand"))).filter(Boolean) as string[]);

  // locations and racks
  const locNames = [...new Set(items.flatMap((x) => x.placement.map((p) => p.location)))];
  for (const c of chunks(locNames)) check("locations", (await sb.from("locations").upsert(c.map((name) => ({ name })), { onConflict: "name" })).error);
  const locs = new Map((await fetchAll<{ id: string; name: string }>("locations", "id,name")).map((l) => [l.name, l.id]));
  const rackKeys = new Map<string, { location_id: string; code: string }>();
  for (const x of items) for (const p of x.placement) for (const code of p.racks) rackKeys.set(locs.get(p.location) + "|" + code, { location_id: locs.get(p.location)!, code });
  for (const c of chunks([...rackKeys.values()])) check("racks", (await sb.from("racks").upsert(c, { onConflict: "location_id,code" })).error);
  const racks = new Map((await fetchAll<{ id: string; location_id: string; code: string }>("racks", "id,location_id,code")).map((r) => [r.location_id + "|" + r.code, r.id]));

  // products
  const prodRows = items.map((x) => ({
    legacy_no: x.legacy,
    name_en: x.name,
    code_name: txt(g(x.r, "code name")),
    name_ur: txt(g(x.r, "name (urdu)")),
    scheme: x.scheme, scheme_buy: x.buy, scheme_free: x.free,
    cp: num(g(x.r, "cp")),
    list_id: lists.get(txt(g(x.r, "list")) ?? "") ?? null,
    brand_id: brands.get(txt(g(x.r, "brand")) ?? "") ?? null,
    company_id: companies.get(txt(g(x.r, "company")) ?? "") ?? null,
    default_location_id: x.placement[0] ? locs.get(x.placement[0].location) ?? null : null,
  }));
  for (const c of chunks(prodRows)) check("products", (await sb.from("products").upsert(c, { onConflict: "legacy_no" })).error);
  const pid = new Map((await fetchAll<{ id: string; legacy_no: number }>("products", "id,legacy_no")).map((p) => [p.legacy_no, p.id]));

  // placement links (additive)
  const pl: { product_id: string; location_id: string }[] = [];
  const pr: { product_id: string; rack_id: string }[] = [];
  for (const x of items) for (const p of x.placement) {
    const product_id = pid.get(x.legacy)!, location_id = locs.get(p.location)!;
    pl.push({ product_id, location_id });
    for (const code of p.racks) pr.push({ product_id, rack_id: racks.get(location_id + "|" + code)! });
  }
  for (const c of chunks(pl)) check("product_locations", (await sb.from("product_locations").upsert(c, { onConflict: "product_id,location_id", ignoreDuplicates: true })).error);
  for (const c of chunks(pr)) check("product_racks", (await sb.from("product_racks").upsert(c, { onConflict: "product_id,rack_id", ignoreDuplicates: true })).error);

  // opening stock (only where the sheet has a quantity and the product has none yet)
  const hasOpening = new Set((await fetchAll<{ product_id: string }>("stock_movements", "product_id")).map((m) => m.product_id));
  let mainId: string | null = null;
  const mv: { product_id: string; location_id: string; qty: number; type: string; note: string }[] = [];
  for (const x of items) {
    const q = num(g(x.r, "stock"));
    const product_id = pid.get(x.legacy)!;
    if (q <= 0 || hasOpening.has(product_id)) continue;
    let location_id = x.placement[0] ? locs.get(x.placement[0].location) : undefined;
    if (!location_id) {
      if (!mainId) { check("locations", (await sb.from("locations").upsert({ name: "Main" }, { onConflict: "name" })).error); mainId = (await sb.from("locations").select("id").eq("name", "Main").single()).data!.id; }
      location_id = mainId!;
    }
    if (x.placement.length > 1) warnings.push("#" + x.legacy + " " + x.name + ": stock " + q + " put in '" + x.placement[0].location + "' (sheet has one stock number for several locations)");
    mv.push({ product_id, location_id, qty: q, type: "opening", note: "Imported from Excel" });
  }
  for (const c of chunks(mv)) check("stock_movements", (await sb.from("stock_movements").insert(c)).error);

  const summary = [
    "Products: " + prodRows.length, "Price lists: " + lists.size, "Companies: " + companies.size, "Brands: " + brands.size,
    "Locations: " + locs.size, "Racks: " + racks.size, "Opening stock rows: " + mv.length, "Warnings: " + warnings.length,
  ];
  console.log(summary.join("\n"));
  writeFileSync("import-report.txt", summary.join("\n") + "\n\n" + warnings.join("\n") + "\n");
  console.log("Details in import-report.txt");
}

main().catch((e) => { console.error(e); process.exit(1); });
