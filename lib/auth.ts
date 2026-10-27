import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./supabase";
import { hasAny, type SessionUser } from "./permissions";

export const SESSION_COOKIE = "ia_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or shorter than 32 characters. Add it in Vercel and .env.local.");
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(MAX_AGE + "s").sign(secret());
}

export async function readSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try { return (await jwtVerify(token, secret())).payload.sub ?? null; } catch { return null; }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

/** The signed-in user, loaded fresh from the database (so a deactivated user is locked out at once). */
export async function getUser(): Promise<SessionUser | null> {
  const uid = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const { data } = await db()
    .from("app_users")
    .select("id,name,role_id,active,location_ids,is_salesman,must_change_pin,role:roles(name,perms,own_only)")
    .eq("id", uid)
    .maybeSingle();
  if (!data || !data.active) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = Array.isArray(data.role) ? data.role[0] : data.role;
  if (!r) return null;
  return {
    id: data.id, name: data.name, roleId: data.role_id, roleName: r.name, perms: r.perms ?? [], ownOnly: !!r.own_only,
    locationIds: data.location_ids ?? null, isSalesman: !!data.is_salesman, mustChangePin: !!data.must_change_pin,
  };
}

type Auth = { user: SessionUser; error?: undefined } | { error: NextResponse; user?: undefined };

/** For API routes. `anyOf`: the user needs at least one of these permissions (none listed = any signed-in user). */
export async function authorize(...anyOf: string[]): Promise<Auth> {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };
  if (user.mustChangePin) return { error: NextResponse.json({ error: "Choose a new PIN first." }, { status: 403 }) };
  if (anyOf.length && !hasAny(user, anyOf)) return { error: NextResponse.json({ error: "You do not have permission for this." }, { status: 403 }) };
  return { user };
}
