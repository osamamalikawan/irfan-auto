/** Two selling prices per product: CP (ledger sales) and RP (retail / counter sales). */
export type PriceType = "rp" | "cp";
type Priced = { cp: number; rp?: number | null };

/** Counter sales start on RP, ledger sales on CP. */
export const defaultPriceType = (kind: "counter" | "ledger"): PriceType => (kind === "counter" ? "rp" : "cp");

/** The price to use: the chosen type, or the other one when the product has no price of the chosen type. 0 = no price at all. */
export function priceFor(p: Priced, t: PriceType): number {
  const cp = Number(p.cp) || 0, rp = Number(p.rp) || 0;
  const [first, second] = t === "rp" ? [rp, cp] : [cp, rp];
  return first > 0 ? first : second > 0 ? second : 0;
}

/** Which price `priceFor` really used (it can differ from the chosen type), or null when there is none. */
export function priceUsed(p: Priced, t: PriceType): PriceType | null {
  const cp = Number(p.cp) || 0, rp = Number(p.rp) || 0;
  if (t === "rp") return rp > 0 ? "rp" : cp > 0 ? "cp" : null;
  return cp > 0 ? "cp" : rp > 0 ? "rp" : null;
}

const fmt = (v: number | null | undefined) => (Number(v) > 0 ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—");
/** "CP 120 - RP 150" for lists and drop-downs; "—" stands for a price that is not set. */
export const cpRpText = (p: Priced) => "CP " + fmt(p.cp) + " - RP " + fmt(p.rp);

/** Segmented-switch labels. */
export const PRICE_LABEL: Record<PriceType, string> = { rp: "RP", cp: "CP" };
