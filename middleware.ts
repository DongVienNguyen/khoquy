import { NextRequest, NextResponse } from "next/server";

function isStaticAsset(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  // Cho phép các tệp PWA quan trọng
  if (pathname === "/sw.js") return true;
  if (pathname === "/offline.html") return true;
  if (pathname === "/manifest.webmanifest") return true;
  return /\.(png|jpg|jpeg|svg|gif|ico|webp|css|js|map|woff|woff2|ttf|mp4|webm|pdf|html|webmanifest)$/.test(pathname);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const linkUser = req.cookies.get("linkUser")?.value || "";
  const staffRole = req.cookies.get("staffRole")?.value || "";
  const staffDept = req.cookies.get("staffDept")?.value || "";

  // Không có phiên "đi link" => cho qua
  // Ưu tiên phiên 'đi link' (chỉ cho phép /asset-entry và (với NQ) /daily-report và tài nguyên tĩnh)
  if (linkUser) {
    const isAssetEntry =
      pathname === "/asset-entry" || pathname.startsWith("/asset-entry");
    const isDailyReport =
      pathname === "/daily-report" || pathname.startsWith("/daily-report");
    const isAuthPage = pathname === "/sign-out" || pathname === "/sign-in";

    const isNQUser = staffRole === "user" && staffDept === "NQ";

    if (
      isStaticAsset(pathname) ||
      isAuthPage ||
      isAssetEntry ||
      (isNQUser && isDailyReport)
    ) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = isNQUser ? "/daily-report" : "/asset-entry";
    return NextResponse.redirect(url);
  }

  // Quy tắc hạn chế theo role/department khi KHÔNG ở phiên 'đi link'
  // Admin: không hạn chế
  if (staffRole === "admin") {
    return NextResponse.next();
  }
  // User QLN: chỉ được asset-entry
  if (staffRole === "user" && staffDept === "QLN") {
    if (
      pathname === "/asset-entry" ||
      pathname.startsWith("/asset-entry") ||
      pathname === "/sign-out" ||
      pathname === "/sign-in" ||
      isStaticAsset(pathname)
    ) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/asset-entry";
    return NextResponse.redirect(url);
  }
  // User NQ: chỉ được asset-entry và daily-report
  if (staffRole === "user" && staffDept === "NQ") {
    if (
      pathname === "/asset-entry" ||
      pathname.startsWith("/asset-entry") ||
      pathname === "/daily-report" ||
      pathname.startsWith("/daily-report") ||
      pathname === "/sign-out" ||
      pathname === "/sign-in" ||
      isStaticAsset(pathname)
    ) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/asset-entry";
    return NextResponse.redirect(url);
  }

  // Mặc định: cho qua
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/asset-entry/:path*",
    "/daily-report/:path*",
    "/management/:path*",
    "/borrow-report/:path*",
    "/other-assets/:path*",
    "/sign-in",
    "/sign-out",
    "/:username"
  ],
};