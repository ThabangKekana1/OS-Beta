import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const is1os = hostname.startsWith("1os.");

  if (is1os && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/migration";
    return NextResponse.redirect(url, { status: 301 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
