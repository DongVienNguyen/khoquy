import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Đăng nhập | Thông báo TS",
  description: "Đăng nhập vào hệ thống quản lý tài sản kho.",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function SignInLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}