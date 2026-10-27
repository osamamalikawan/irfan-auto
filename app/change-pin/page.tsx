import { redirect } from "next/navigation";
import ChangePinForm from "@/components/ChangePinForm";
import { getUser } from "@/lib/auth";

export default async function Page() {
  const user = await getUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto min-h-dvh max-w-sm p-5 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <h1 className="mb-1 text-xl font-bold">Hello, {user.name}</h1>
      <p className="mb-4 text-sm text-muted">Set a PIN only you know.</p>
      <ChangePinForm forced={user.mustChangePin} />
    </main>
  );
}
