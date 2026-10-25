"use client";
import { usePathname } from "next/navigation";

export default function Topbar() {
  const path = usePathname();
  const title = path === "/inventory" ? "Stock & Racks" : path === "/inventory/new" ? "Add product" : path.endsWith("/edit") ? "Edit product" : "Product";
  return (
    <div className="hidden items-center border-b border-line bg-surface px-5 py-2.5 lg:flex">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    </div>
  );
}
