"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = (window as any).navigator?.standalone === true;
  return Boolean(mm || iosStandalone);
}
function isSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isCriOS = /CriOS/i.test(ua); // Chrome on iOS
  const isFxiOS = /FxiOS/i.test(ua); // Firefox on iOS
  const isEdgiOS = /EdgiOS/i.test(ua); // Edge on iOS
  const isSafariUA = /Safari/i.test(ua) && !isCriOS && !isFxiOS && !isEdgiOS;
  return isSafariUA;
}

const STORAGE_KEY = "pwa_install_guide_dismissed";

const PWAInstallGuide: React.FC = () => {
  const pathname = usePathname();
  const [dismissed, setDismissed] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      setDismissed(v === "1");
    } catch {}
    setReady(true);
  }, []);

  const hideOnRoutes = ["/sign-in", "/sign-out"];
  const shouldHide =
    !ready ||
    dismissed ||
    !isIOS() ||
    !isSafari() ||
    isStandalone() ||
    hideOnRoutes.includes(pathname);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  };

  if (shouldHide) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm w-[92%] sm:w-96">
      <Alert className="bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-700 mt-0.5" />
          <div className="flex-1">
            <AlertDescription className="text-blue-900 text-sm">
              Để cài ứng dụng trên iPhone: Mở Safari, bấm nút chia sẻ (biểu tượng ô vuông có mũi tên), chọn
              “Thêm vào Màn hình chính”. Sau đó mở từ màn hình chính để dùng chế độ toàn màn hình.
            </AlertDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            Ẩn
          </Button>
        </div>
      </Alert>
    </div>
  );
};

export default PWAInstallGuide;