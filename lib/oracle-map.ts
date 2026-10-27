// How the old Oracle system's columns become fields of this app. Change the config, not the code.
import type { Row } from "./oracle-dump";

export type MapConfig = {
  /** Which old price column is the "counter price" (CP). */
  cpFrom: "SRATELOSE" | "SRATEPACK" | "RATEA" | "RATEB" | "RATEC";
  /** Old column used as the product's display name; the other one is kept as code name. */
  nameFrom: "CPNAME" | "PNAME";
  /** Old column used as the reorder level. */
  reorderFrom: "REQTY" | "MAXQTY" | null;
};
export const DEFAULT_CONFIG: MapConfig = { cpFrom: "SRATELOSE", nameFrom: "CPNAME", reorderFrom: "REQTY" };

export const str = (v: unknown) => (v == null ? null : String(v).replace(/[\u200e\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim() || null);
export const num = (v: unknown) => { const n = Number(v); return v != null && Number.isFinite(n) ? n : 0; };

export type MappedProduct = {
  ora_pcode: number; name_en: string; code_name: string | null; name_ur: string | null;
  scheme: string | null; scheme_buy: number | null; scheme_free: number | null;
  cp: number; reorder_level: number; active: boolean;
  catid: number | null; genid: number | null; stock: number; legacy: Record<string, unknown>;
};

export function mapProduct(r: Row, cfg: MapConfig = DEFAULT_CONFIG): MappedProduct | null {
  const pname = str(r.PNAME), cpname = str(r.CPNAME);
  const name = (cfg.nameFrom === "CPNAME" ? cpname ?? pname : pname ?? cpname);
  if (!name || r.PCODE == null) return null;
  const buy = num(r.BQTY), free = num(r.GQTY);
  const legacyKeys = ["OP", "RATEA", "RATEB", "RATEC", "SRATEPACK", "SRATELOSE", "LOSEINPACK", "DISCB", "DISCPCENT", "DISCAMT", "SCODE", "CCODE",
    "PACKNAME", "LOSENAME", "REQTY", "MAXQTY", "OST", "INHAND", "LOCATION", "PTYPE", "GENID", "CATID"];
  const legacy: Record<string, unknown> = {};
  for (const k of legacyKeys) if (r[k] != null) legacy[k] = r[k];
  return {
    ora_pcode: Number(r.PCODE),
    name_en: name,
    code_name: cfg.nameFrom === "CPNAME" ? pname : cpname,
    name_ur: str(r.PNAMEURDU),
    scheme: buy > 0 && free > 0 ? buy + "+" + free : null,
    scheme_buy: buy > 0 && free > 0 ? buy : null,
    scheme_free: buy > 0 && free > 0 ? free : null,
    cp: num(r[cfg.cpFrom]),
    reorder_level: cfg.reorderFrom ? num(r[cfg.reorderFrom]) : 0,
    active: r.ACTIVE !== "N",
    catid: r.CATID == null ? null : Number(r.CATID),
    genid: r.GENID == null ? null : Number(r.GENID),
    stock: num(r.INHAND),
    legacy,
  };
}
