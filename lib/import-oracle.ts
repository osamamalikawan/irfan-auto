/**
 * Imports the old Oracle system's master data (from an "INSERT INTO" dump) into this app.
 *
 *   npm run import:oracle -- path/to/dump.sql                 preview only, nothing is written
 *   npm run import:oracle -- path/to/dump.sql --apply         write products, price lists, brands, locations
 *     (if npm drops the flag on Windows: npx tsx --env-file=.env.local scripts/import-oracle.ts path/to/dump.sql --apply)
 *   npm run import:oracle -- path/to/dump.sql --apply --users also create users from the COLLECTOR table
 *   options: --cp=SRATELOSE|SRATEPACK|RATEA|RATEB|RATEC   --name=CPNAME|PNAME   --reorder=REQTY|MAXQTY|none
 *
 * Safe to re-run: rows are matched on the old ids. Products already imported from the Excel file are matched on
 * their code name (old PNAME) and then carry the old id from then on. Details of matched products are overwritten
 * with the old system's values; stock is only written for products that have none yet.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readOracleDump } from "../lib/oracle-dump";
import { buildPlan, MASTER_TABLES, type Named } from "../lib/oracle-plan";
import { DEFAULT_CONFIG, type MapConfig } from "../lib/oracle-map";

const args = process.argv.slice(2);
const WORDS = ["apply", "users"];
const file = args.find((a) => !a.startsWith("--") && !WORDS.includes(a));
const flag = (n: string) => args.find((a) => a.startsWith("--" + n + "="))?.split("=")[1];
if (!file) { console.error("Usage: npm run import:oracle -- <dump.sql> [--apply] [--users]"); process.exit(1); }
const has = (n: string) => args.includes("--" + n) || args.includes(n);
const apply = has("apply"), withUsers = has("users");

const cfg: MapConfig = {
  cpFrom: (flag("cp") as MapConfig["cpFrom"]) ?? DEFAULT_CONFIG.cpFrom,
  nameFrom: (flag("name") as MapConfig["nameFrom"]) ?? DEFAULT_CONFIG.nameFrom,
  reorderFrom: flag("reorder") === "none" ? null : ((flag("reorder") as MapConfig["reorderFrom"]) ?? DEFAULT_CONFIG.reorderFrom),
};

const chunks = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const check = (label: string, error: { message: string } | null) => { if (error) throw new Error(label + ": " + error.message); };

async function main() {
  const data = await readOracleDump(file!, [...MASTER_TABLES]);
  const plan = buildPlan(data, cfg);
  const lines = [
    "Source: " + file, "Mapping: CP <- " + cfg.cpFrom + ", name <- " + cfg.nameFrom + ", reorder <- " + (cfg.reorderFrom ?? "none"),
    "Price lists (CAT): " + plan.lists.length, "Companies (DEPT): " + plan.companies.length, "Brands (GEN): " + plan.brands.length,
    "Locations (godowns in CUST): " + plan.godowns.length, "Products (PROD): " + plan.products.length, "Users (COLLECTOR): " + plan.collectors.length,
    "Products with stock to import: " + plan.products.filter((p) => p.stock > 0).length, "Inactive products (ACTIVE = N): " + plan.products.filter((p) => !p.active).length,
    ...plan.warnings.map((w) => "WARNING: " + w),
  ];
  console.log(lines.join("\n"));
  writeFileSync("oracle-import-preview.json", JSON.stringify({ config: cfg, sampleProducts: plan.products.slice(0, 20), godowns: plan.godowns, lists: plan.lists, companies: plan.companies, brands: plan.brands }, null, 2));
  if (!apply) { console.log("\nPreview only. Nothing was written. Details: oracle-import-preview.json\nRun again with --apply (or the word apply) to import."); return; }

  const { db } = await import("../lib/supabase");
  const sb = db();

  async function fetchAll<T>(table: string, select: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await sb.from(table).select(select).range(from, from + 999);
      check(table, error);
      out.push(...((rows ?? []) as unknown as T[]));
      if (!rows || rows.length < 1000) break;
    }
    return out;
  }

  /** Finds each old row in the app by old id, then by name; creates what is missing. Returns old id -> new id. */
  async function sync(table: string, oraCol: string, items: Named[], extra: (n: Named) => Record<string, unknown> = () => ({})) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await fetchAll<any>(table, "id,name," + oraCol);
    const byOra = new Map(existing.filter((e) => e[oraCol] != null).map((e) => [Number(e[oraCol]), e]));
    const byName = new Map(existing.map((e) => [String(e.name).trim().toLowerCase(), e]));
    const out = new Map<number, string>();
    for (const it of items) {
      const e = byOra.get(it.ora) ?? byName.get(it.name.toLowerCase());
      if (e) {
        if (e[oraCol] == null) check(table, (await sb.from(table).update({ [oraCol]: it.ora, ...extra(it) }).eq("id", e.id)).error);
        out.set(it.ora, e.id);
      } else {
        const { data: ins, error } = await sb.from(table).insert({ name: it.name, [oraCol]: it.ora, ...extra(it) }).select("id").single();
        check(table, error);
        out.set(it.ora, ins!.id);
        byName.set(it.name.toLowerCase(), { id: ins!.id, name: it.name, [oraCol]: it.ora });
      }
    }
    return out;
  }

  const listId = await sync("price_lists", "ora_catid", plan.lists);
  const companyId = await sync("companies", "ora_deptid", plan.companies);
  const brandDept = new Map(plan.brands.map((b) => [b.ora, b.deptid]));
  const brandId = await sync("brands", "ora_genid", plan.brands, (n) => ({ company_id: companyId.get(brandDept.get(n.ora) ?? -1) ?? null }));
  const locId = await sync("locations", "ora_ccode", plan.godowns, () => ({ type: "Godown" }));
  console.log("Lists/companies/brands/locations synced:", listId.size, companyId.size, brandId.size, locId.size);

  // products: match by old id, else by code name (products that came from the Excel file)
  const existing = await fetchAll<{ id: string; ora_pcode: number | null; code_name: string | null }>("products", "id,ora_pcode,code_name");
  const byPcode = new Map(existing.filter((e) => e.ora_pcode != null).map((e) => [e.ora_pcode!, e.id]));
  const free = new Map<string, string[]>();
  for (const e of existing) if (e.ora_pcode == null && e.code_name) { const k = e.code_name.trim().toLowerCase(); (free.get(k) ?? free.set(k, []).get(k)!).push(e.id); }
  const rows = plan.products.map((p) => {
    const id = byPcode.get(p.ora_pcode) ?? free.get((p.code_name ?? "").toLowerCase())?.shift();
    const brandOra = p.genid ?? -1;
    return {
      ...(id ? { id } : {}),
      ora_pcode: p.ora_pcode, name_en: p.name_en, code_name: p.code_name, name_ur: p.name_ur,
      scheme: p.scheme, scheme_buy: p.scheme_buy, scheme_free: p.scheme_free, cp: p.cp, reorder_level: p.reorder_level, active: p.active,
      list_id: listId.get(p.catid ?? -1) ?? null, brand_id: brandId.get(brandOra) ?? null,
      company_id: companyId.get(brandDept.get(brandOra) ?? -1) ?? null, legacy: p.legacy,
    };
  });
  const matched = rows.filter((r) => "id" in r), fresh = rows.filter((r) => !("id" in r));
  for (const c of chunks(matched)) check("products (update)", (await sb.from("products").upsert(c, { onConflict: "id" })).error);
  for (const c of chunks(fresh)) check("products (insert)", (await sb.from("products").insert(c)).error);
  console.log("Products: " + matched.length + " matched existing, " + fresh.length + " new");

  // hide price lists in which every product is inactive (the old system has many)
  const activeCats = new Set(plan.products.filter((p) => p.active && p.catid != null).map((p) => p.catid!));
  const emptyLists = [...new Set(plan.lists.filter((l) => !activeCats.has(l.ora)).map((l) => listId.get(l.ora)!).filter(Boolean))];
  for (const c of chunks(emptyLists, 100)) check("price_lists", (await sb.from("price_lists").update({ visible: false }).in("id", c)).error);
  console.log("Price lists hidden (no active products):", emptyLists.length, "of", listId.size);

  // opening stock: first godown, or "Main"
  const pid = new Map((await fetchAll<{ id: string; ora_pcode: number }>("products", "id,ora_pcode")).filter((p) => p.ora_pcode != null).map((p) => [p.ora_pcode, p.id]));
  const has = new Set((await fetchAll<{ product_id: string }>("stock_movements", "product_id")).map((m) => m.product_id));
  let stockLoc = plan.godowns[0] ? locId.get(plan.godowns[0].ora) : undefined;
  if (!stockLoc) {
    check("locations", (await sb.from("locations").upsert({ name: "Main" }, { onConflict: "name" })).error);
    stockLoc = (await sb.from("locations").select("id").eq("name", "Main").single()).data!.id as string;
  }
  const mv = plan.products.filter((p) => p.stock > 0 && pid.has(p.ora_pcode) && !has.has(pid.get(p.ora_pcode)!))
    .map((p) => ({ product_id: pid.get(p.ora_pcode)!, location_id: stockLoc!, qty: p.stock, type: "opening", note: "Imported from old system" }));
  for (const c of chunks(mv)) check("stock_movements", (await sb.from("stock_movements").insert(c)).error);
  console.log("Opening stock rows:", mv.length);

  if (withUsers) {
    const bcrypt = (await import("bcryptjs")).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const us = await fetchAll<any>("app_users", "id,name,ora_collectorid");
    const have = new Set(us.filter((u) => u.ora_collectorid != null).map((u) => Number(u.ora_collectorid)));
    const names = new Set(us.map((u) => String(u.name).toLowerCase()));
    let made = 0;
    for (const c of plan.collectors) {
      if (have.has(c.ora)) continue;
      let name = c.name;
      if (names.has(name.toLowerCase())) name += " (" + c.ora + ")";
      names.add(name.toLowerCase());
      // nobody knows this PIN: an administrator sets a real one in Users & Roles before the person can sign in
      const pin_hash = await bcrypt.hash(randomBytes(16).toString("hex"), 10);
      check("app_users", (await sb.from("app_users").insert({
        name, role_id: "salesman", pin_hash, must_change_pin: true, active: c.active, is_salesman: true,
        location_ids: c.godown && locId.get(c.godown) ? [locId.get(c.godown)] : null, ora_collectorid: c.ora,
      })).error);
      made++;
    }
    console.log("Users created:", made, "(set their PINs in Users & Roles)");
  }
  writeFileSync("oracle-import-report.txt", lines.join("\n") + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
