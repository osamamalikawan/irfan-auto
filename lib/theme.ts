export const THEME_COOKIE = "ia_theme";
export type Theme = "system" | "light" | "dark";
export const parseTheme = (v: string | null | undefined): Theme => (v === "light" || v === "dark" ? v : "system");
