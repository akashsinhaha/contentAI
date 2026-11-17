import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode, verifySessionToken } from "@/lib/auth";

// Webhooks and cron do their own checks (Meta signature, CRON_SECRET), so the owner login does not apply to them.
const PUBLIC_PREFIXES = ["/login", "/api/webhooks", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  const mode = authMode();
  if (mode === "open") return NextResponse.next();
  if (mode === "password" && (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
