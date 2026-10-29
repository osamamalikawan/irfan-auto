export const EXPENSE_CATEGORIES = ["Fuel", "Market purchase", "Refund", "Salaries", "Rent", "Utilities", "Repairs", "Other"] as const;
export const pad4 = (n: number | string) => String(n).padStart(4, "0");
