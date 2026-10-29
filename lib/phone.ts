/** Pakistani mobile numbers: 0300-1234567 -> 923001234567 for wa.me links. */
export function waLink(phone: string | null | undefined) {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const intl = d.startsWith("92") ? d : d.startsWith("0") ? "92" + d.slice(1) : d;
  return "https://wa.me/" + intl;
}
export const telLink = (phone: string | null | undefined) => {
  const d = String(phone ?? "").replace(/[^\d+]/g, "");
  return d.length >= 7 ? "tel:" + d : null;
};
