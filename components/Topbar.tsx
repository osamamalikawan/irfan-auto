"use client";
import { usePathname } from "next/navigation";

export default function Topbar() {
  const path = usePathname();
  const title = path.startsWith("/route-plans") ? "Route plans" : path.startsWith("/planner") ? "Monthly planner" : path === "/purchases/new" ? "New purchase" : path.startsWith("/purchases") ? (path === "/purchases" ? "Purchases" : "Purchase") : path.startsWith("/suppliers") ? (path === "/suppliers" ? "Suppliers" : "Supplier") : path.startsWith("/accounts") ? "Accounts" : path.startsWith("/returns") ? "Returns" : path.startsWith("/dispatch") ? "Dispatch vouchers" : path.startsWith("/expenses") ? "Expenses" : path.startsWith("/vouchers") ? (path === "/vouchers" ? "Payment vouchers" : "Voucher") : path === "/sales/new" ? "New invoice" : path.startsWith("/sales") ? (path === "/sales" ? "Sales" : "Invoice") : path === "/customers/new" ? "Add customer" : path.startsWith("/customers") ? (path.endsWith("/edit") ? "Edit customer" : path === "/customers" ? "Customers" : "Customer") : path.startsWith("/routes") ? "Routes & Areas" : path.startsWith("/users") ? "Users & Roles" : path.startsWith("/account") ? "My account" : path.startsWith("/settings") ? "Settings" : path === "/inventory" ? "Stock & Racks" : path === "/inventory/new" ? "Add product" : path.endsWith("/edit") ? "Edit product" : "Product";
  return (
    <div data-noprint className="hidden items-center border-b border-line bg-surface px-5 py-2.5 lg:flex">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    </div>
  );
}
