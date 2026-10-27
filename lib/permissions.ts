// Shared by server and browser. Keys match the original prototype.
export const PERM_GROUPS: { title: string; perms: [string, string][] }[] = [
  { title: "Stock", perms: [
    ["stock.view", "View stock"], ["stock.manage", "Add and edit products and locations"], ["stock.restock", "Receive stock"],
    ["stock.adjust", "Issue and correct stock"], ["stock.transfer", "Transfer stock between locations"], ["racks.manage", "Manage racks"],
  ] },
  { title: "Sales", perms: [
    ["sales.create", "Create sales"], ["sales.discount", "Give discounts"], ["sales.return", "Take returns"],
    ["sales.cancel", "Cancel sales"], ["payments.receive", "Receive payments"],
  ] },
  { title: "Customers and routes", perms: [
    ["customers.view", "View customers"], ["customers.edit", "Add and edit customers"], ["routes.manage", "Manage routes and areas"],
  ] },
  { title: "Field work", perms: [
    ["planner.edit", "Edit the weekly planner"], ["visits.record", "Record visits"], ["targets.manage", "Set targets"], ["reports.view", "View reports"],
  ] },
  { title: "Administration", perms: [
    ["accounts.edit", "Accounts, expenses and vouchers"], ["settings.edit", "Change settings"], ["users.manage", "Manage users and roles"],
  ] },
];
export const ALL_PERMS = PERM_GROUPS.flatMap((g) => g.perms.map(([k]) => k));

export type SessionUser = {
  id: string; name: string; roleId: string; roleName: string; perms: string[];
  ownOnly: boolean; locationIds: string[] | null; isSalesman: boolean; mustChangePin: boolean;
};

export const hasPerm = (u: { perms: string[] } | null | undefined, p: string) => !!u && (u.perms.includes("*") || u.perms.includes(p));
export const hasAny = (u: { perms: string[] } | null | undefined, ps: string[]) => ps.some((p) => hasPerm(u, p));
