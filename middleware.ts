import { NextRequest, NextResponse } from "next/server";

function isStaticAsset(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return /\.(png|jpg|jpeg|svg|gif|ico|webp|css|js|map|woff|woff2|ttf|mp4|webm|pdf)$/.test(pathname);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const linkUser = req.cookies.get("linkUser")?.value || "";

  // Không có phiên "đi link" => cho qua
  if (!linkUser) {
    return NextResponse.next();
  }

  // Cho phép asset-entry, sign-out và tài nguyên tĩnh
  if (
    pathname === "/asset-entry" ||
    pathname.startsWith("/asset-entry") ||
    pathname === "/sign-out" ||
    isStaticAsset(pathname)
  ) {
    return NextResponse.next();
  }

  // Với phiên "đi link": chặn tất cả đường dẫn khác, đưa về /asset-entry
  const url = req.nextUrl.clone();
  url.pathname = "/asset-entry";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/:path*"],
};