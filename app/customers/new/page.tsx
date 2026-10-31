import { redirect } from "next/navigation";
import CustomerForm from "@/components/CustomerForm";
import { getUser } from "@/lib/auth";
import { canAddCustomer } from "@/lib/permissions";

export default async function Page() {
  if (!canAddCustomer(await getUser())) redirect("/customers");
  return <CustomerForm />;
}
