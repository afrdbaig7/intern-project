import { NextResponse, type NextRequest } from "next/server";

const EXTENSION_ROUTES = [
  "/api/clip",
  "/api/boards",
  "/api/boards/", // list endpoint (exact match above handles the root)
  "/api/auth/users",
];

function isExtensionRoute(pathname: string): boolean {
  if (pathname === "/api/clip") return true;
  if (pathname === "/api/boards") return true;
  if (pathname.startsWith("/api/boards/")) return true;
  if (pathname === "/api/auth/users") return true;
  return false;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";

  if (req.method === "OPTIONS" && isExtensionRoute(req.nextUrl.pathname)) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const res = NextResponse.next();

  if (isExtensionRoute(req.nextUrl.pathname)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Accept");
  }

  return res;
}

export const config = {
  matcher: ["/api/clip", "/api/boards", "/api/boards/:path*", "/api/auth/users"],
};
