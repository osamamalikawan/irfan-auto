import { redirect } from "next/navigation";
import CustomersList from "@/components/CustomersList";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["customers.view", "customers.edit", "sales.create"])) redirect("/account");
  return <CustomersList />;
}
