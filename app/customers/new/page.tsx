import { redirect } from "next/navigation";
import CustomerForm from "@/components/CustomerForm";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page() {
  if (!hasPerm(await getUser(), "customers.edit")) redirect("/customers");
  return <CustomerForm />;
}
