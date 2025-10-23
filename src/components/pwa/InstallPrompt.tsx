"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const InstallPrompt: React.FC = () => {
  const pathname = usePathname();
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState<boolean>(false);

  React.useEffect(() => {
    // Phát hiện app đã cài (standalone)
    const isStandalone =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches ||
        // iOS Safari
        (window as any).navigator?.standalone === true);
    setInstalled(isStandalone);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("Ứng dụng đã được cài trên thiết bị của bạn");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const evt = deferred;
    if (!evt) return;
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === "accepted") {
        toast.success("Đã bắt đầu cài đặt ứng dụng");
      } else {
        toast.warning("Bạn đã hủy cài đặt");
      }
      // Ẩn nút sau khi hiển thị prompt
      setDeferred(null);
    } catch {
      toast.error("Không thể mở hộp thoại cài đặt");
    }
  };

  // Ẩn ở các trang không cần thiết
  const hideOnRoutes = ["/sign-in", "/sign-out"];
  const shouldHide = installed || !deferred || hideOnRoutes.includes(pathname);

  if (shouldHide) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        onClick={handleInstall}
        variant="secondary"
        className="shadow-lg bg-secondary text-secondary-foreground"
        aria-label="Cài đặt ứng dụng"
      >
        <Download className="h-4 w-4" />
        <span className="ml-2">Cài đặt ứng dụng</span>
      </Button>
    </div>
  );
};

export default InstallPrompt;