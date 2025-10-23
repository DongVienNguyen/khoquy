import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/app-header";
import SyncRunner from "@/components/management/SyncRunner";
import { SonnerToaster } from "@/components/ui/sonner";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import OfflineBanner from "@/components/pwa/OfflineBanner";
import PWAInstallGuide from "@/components/pwa/PWAInstallGuide";
import UpdateAppButton from "@/components/pwa/UpdateAppButton";
import PWADebugPanel from "@/components/pwa/PWADebugPanel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Thông báo TS",
  description: "Thông báo kho quỹ lấy TS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon-180x180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppHeader />
        <SyncRunner />
        <SonnerToaster />
        <ServiceWorkerRegister />
        <InstallPrompt />
        <OfflineBanner />
        <PWAInstallGuide />
        <UpdateAppButton />
        <PWADebugPanel />
        {children}
      </body>
    </html>
  );
}