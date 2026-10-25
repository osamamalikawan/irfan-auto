export const qty = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 3 });

export const rs = (n: number | string | null | undefined) =>
  "Rs " + Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });

export type Tone = "red" | "amber" | "green";
export function stockTone(onHand: number, reorder: number): Tone {
  if (onHand <= 0) return "red";
  if (reorder > 0 && onHand <= reorder) return "amber";
  return "green";
}
export const toneClass: Record<Tone, string> = {
  red: "bg-red-bg text-red",
  amber: "bg-amber-bg text-amber",
  green: "bg-green-bg text-green",
};
