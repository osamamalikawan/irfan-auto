import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// First gate: no valid login cookie -> login page (or 401 for the API). Permissions are checked in each API route.
export async function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth && /^bearer\s/i.test(auth) ? auth.slice(7).trim() : req.cookies.get("ia_session")?.value;
  let ok = false;
  const s = process.env.AUTH_SECRET;
  if (token && s) {
    try { await jwtVerify(token, new TextEncoder().encode(s)); ok = true; } catch { /* invalid or expired */ }
  }
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "?next=" + encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|login|api/auth).*)"],
};
