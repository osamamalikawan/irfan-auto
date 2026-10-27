"use client";
import ChangePinForm from "./ChangePinForm";
import { useMe } from "./Me";

export default function AccountView() {
  const { user } = useMe();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:hidden">
        <h1 className="text-lg font-bold">My account</h1>
      </header>
      <div className="space-y-4 p-3 lg:max-w-md lg:p-5">
        <section className="card p-4">
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-muted">{user.roleName}</p>
          <button className="btn mt-3 w-full" onClick={signOut}>Sign out</button>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Change my PIN</h2>
          <ChangePinForm />
        </section>
      </div>
    </div>
  );
}
