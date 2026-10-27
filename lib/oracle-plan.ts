// Turns the raw Oracle tables into "what would be created in this app" (no database needed).
import type { Row } from "./oracle-dump";
import { DEFAULT_CONFIG, mapProduct, num, str, type MapConfig, type MappedProduct } from "./oracle-map";

export const MASTER_TABLES = ["CAT", "DEPT", "GEN", "PROD", "CUST", "COLLECTOR"];

export type Named = { ora: number; name: string };

export function buildPlan(d: Record<string, Row[]>, cfg: MapConfig = DEFAULT_CONFIG) {
  const warnings: string[] = [];
  const named = (rows: Row[], id: string, name: string): Named[] =>
    rows.flatMap((r) => (r[id] != null && str(r[name]) ? [{ ora: Number(r[id]), name: str(r[name])! }] : []));

  const lists = named(d.CAT ?? [], "CATID", "CATNAME");
  const companies = named(d.DEPT ?? [], "DEPTID", "DEPTNAME");
  const brands = (d.GEN ?? []).flatMap((r) =>
    r.GENID != null && str(r.GENNAME) ? [{ ora: Number(r.GENID), name: str(r.GENNAME)!, deptid: r.DEPTID == null ? null : Number(r.DEPTID) }] : []);
  // stock locations: the old system keeps godowns in the customer table (GODOWN = 'Y')
  const godowns = named((d.CUST ?? []).filter((c) => c.GODOWN === "Y" || c.CODE === "G"), "CCODE", "CNAME").sort((a, b) => a.ora - b.ora);

  const listIds = new Set(lists.map((l) => l.ora)), genIds = new Set(brands.map((b) => b.ora));
  const products: MappedProduct[] = [];
  let skipped = 0, noList = 0, badList = 0, badGen = 0, negStock = 0;
  const seen = new Map<string, number>();
  for (const r of d.PROD ?? []) {
    const p = mapProduct(r, cfg);
    if (!p) { skipped++; continue; }
    if (p.catid == null) noList++; else if (!listIds.has(p.catid)) badList++;
    if (p.genid != null && !genIds.has(p.genid)) badGen++;
    if (p.stock < 0) negStock++;
    const k = (p.code_name ?? p.name_en).toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
    products.push(p);
  }
  if (skipped) warnings.push(skipped + " product rows without a name or code were skipped");
  if (noList) warnings.push(noList + " products have no price list (CATID empty)");
  if (badList) warnings.push(badList + " products point to a price list that is not in the CAT rows you gave me");
  if (badGen) warnings.push(badGen + " products point to a GEN (brand) that is not in the GEN rows you gave me");
  if (negStock) warnings.push(negStock + " products have negative stock in the old system; their stock is not imported (it should be corrected there)");
  const dup = [...seen.values()].filter((n) => n > 1).length;
  if (dup) warnings.push(dup + " code names are used by more than one product");

  const collectors = (d.COLLECTOR ?? []).flatMap((r) => {
    const name = str(r.COLLECTORNAME);
    if (r.COLLECTORID == null || !name) return [];
    const g = num(r.GCCODE_ALLOWED);
    return [{ ora: Number(r.COLLECTORID), name, active: r.ACTIVE !== "N", godown: g > 0 ? g : null, mobile: str(r.MOBILE) }];
  });

  return { lists, companies, brands, godowns, products, collectors, warnings };
}
export type Plan = ReturnType<typeof buildPlan>;
