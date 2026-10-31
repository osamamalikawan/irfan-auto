import { hasAny, type SessionUser } from "./permissions";

export type MenuItem = { label: string; href: string; perms?: string[] };
export type MenuGroup = { label: string; items: MenuItem[] };

const STOCK = ["stock.view", "stock.transfer", "stock.adjust"];
const SALES = ["sales.create", "payments.receive"];
const CUSTOMERS = ["customers.view", "customers.edit", "sales.create"];
const VISITS = ["planner.edit", "visits.record", "routes.manage", "reports.view"];
const SUPPLIERS = ["suppliers.view", "suppliers.edit", "suppliers.pay", "purchases.create"];
const MONEY = ["accounts.edit", "reports.view"];

/**
 * The one menu used by the top bar (desktop) and the "More" sheet (phone).
 * Order here is the order on screen, and the number keys follow it (Alt+1 opens the first menu, 1 to 9 pick an item).
 * An item with no `perms` is open to everyone; groups with no visible item are hidden.
 */
export const MENU: MenuGroup[] = [
  { label: "Stock", items: [
    { label: "Stock & Racks", href: "/inventory", perms: STOCK },
    { label: "Low stock", href: "/inventory?filter=low", perms: STOCK },
    { label: "Add product", href: "/inventory/new", perms: ["stock.manage"] },
  ] },
  { label: "Sales", items: [
    { label: "New Invoice", href: "/sales/new", perms: ["sales.create"] },
    { label: "Sales", href: "/sales", perms: SALES },
    { label: "Returns", href: "/returns", perms: ["sales.return", "reports.view"] },
    { label: "Dispatch vouchers", href: "/dispatch", perms: ["sales.create", "stock.view", "stock.transfer"] },
    { label: "Completed Sales", href: "/sales?status=confirmed&range=month", perms: SALES },
  ] },
  { label: "People", items: [
    { label: "Customers", href: "/customers", perms: CUSTOMERS },
    { label: "Suppliers", href: "/suppliers", perms: SUPPLIERS },
    { label: "Employees", href: "/users?tab=users", perms: ["users.manage"] },
  ] },
  { label: "Visit Planning", items: [
    { label: "Monthly planner", href: "/planner", perms: VISITS },
    { label: "Route plans", href: "/route-plans", perms: VISITS },
    { label: "Routes & Areas", href: "/routes", perms: ["routes.manage"] },
    { label: "Today Visits", href: "/route-plans?range=today", perms: VISITS },
    { label: "Completed Visits", href: "/route-plans?tab=completed&range=month", perms: VISITS },
  ] },
  { label: "Accounts", items: [
    { label: "Expenses", href: "/expenses", perms: MONEY },
    { label: "Payment vouchers", href: "/vouchers", perms: ["payments.receive", "accounts.edit", "reports.view"] },
    { label: "Accounts", href: "/accounts", perms: MONEY },
  ] },
  { label: "Purchasing", items: [
    { label: "Purchases", href: "/purchases", perms: ["purchases.create", "purchases.cancel", "suppliers.view"] },
    { label: "New purchase", href: "/purchases/new", perms: ["purchases.create"] },
  ] },
  { label: "Settings", items: [
    { label: "Stock Settings", href: "/settings#stock-settings", perms: ["settings.edit"] },
    { label: "Settings", href: "/settings", perms: ["settings.edit"] },
    { label: "User & Roles", href: "/users?tab=roles", perms: ["users.manage"] },
  ] },
];

/** The menu this person is allowed to see. */
export function visibleMenu(user: { perms: string[] } | null | undefined): MenuGroup[] {
  return MENU
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perms || hasAny(user as Pick<SessionUser, "perms">, i.perms)) }))
    .filter((g) => g.items.length);
}

const split = (href: string) => {
  const [noHash] = href.split("#");
  const [base, query = ""] = noHash.split("?");
  return { base, query: new URLSearchParams(query) };
};

/** Which item of a group matches the current page (the most specific one), or null. */
export function activeHref(group: MenuGroup, path: string, params: URLSearchParams): string | null {
  let best: { href: string; score: number } | null = null;
  for (const it of group.items) {
    if (it.href.includes("#")) continue; // a jump link, never "current"
    const { base, query } = split(it.href);
    if (path !== base && !path.startsWith(base + "/")) continue;
    let hits = 0, ok = true;
    query.forEach((v, k) => { if (params.get(k) === v) hits++; else ok = false; });
    if (!ok) continue;
    const score = base.length * 10 + hits;
    if (!best || score > best.score) best = { href: it.href, score };
  }
  return best?.href ?? null;
}
