"use client";
import { createContext, useContext } from "react";
import { hasAny, hasPerm, type SessionUser } from "@/lib/permissions";

const Ctx = createContext<SessionUser | null>(null);

export function MeProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

/** The signed-in user and permission checks, for hiding buttons the person is not allowed to use. */
export function useMe() {
  const user = useContext(Ctx);
  if (!user) throw new Error("useMe must be used inside the app shell");
  return { user, can: (p: string) => hasPerm(user, p), canAny: (ps: string[]) => hasAny(user, ps) };
}
