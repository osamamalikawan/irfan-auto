import { redirect } from "next/navigation";
import EmployeesList from "@/components/EmployeesList";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["employees.view", "employees.manage", "employees.pay"])) redirect("/dashboard");
  return <EmployeesList />;
}
