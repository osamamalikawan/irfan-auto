// Turns what the speech engine heard into a search query that matches how parts are stored.

// Letters spoken in Urdu ("سی ڈی 70") -> latin, so they match model codes like CD70.
const LETTERS: Record<string, string> = {
  "سی": "c", "ڈی": "d", "ایچ": "h", "وائی": "y", "ایم": "m", "ایکس": "x", "ایس": "s", "اے": "a",
  "بی": "b", "آر": "r", "ایف": "f", "جی": "g", "کے": "k", "ایل": "l", "این": "n", "پی": "p",
  "ٹی": "t", "یو": "u", "وی": "v", "زیڈ": "z",
};

export function normalizeQuery(input: string): string {
  const base = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // Urdu/Arabic diacritics
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Urdu digits ۷۰ -> 70
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")           // invisible direction marks
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإ]/g, "ا")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = base.split(" ").filter(Boolean).map((w) => LETTERS[w] ?? w);

  // Join spoken model codes: "c d 70" -> "cd70", "h 125" -> "h125", "cd 70" -> "cd70".
  const out: string[] = [];
  for (let i = 0; i < t.length; ) {
    let code = "";
    let j = i;
    while (j < t.length && /^[a-z]$/.test(t[j])) code += t[j++];
    if (!code && /^[a-z]{2}$/.test(t[j] ?? "")) code = t[j++];
    if (code && j < t.length && /^\d+$/.test(t[j])) code += t[j++];
    if (code && (code.length > 1 || /\d/.test(code))) { out.push(code); i = j; continue; }
    out.push(t[i]);
    i++;
  }
  return out.join(" ");
}
