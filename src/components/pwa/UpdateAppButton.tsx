"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

const UpdateAppButton: React.FC = () => {
  const [visible, setVisible] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Hiển thị nút nếu có SW
    setVisible(true);
  }, []);

  const checkAndUpdate = async () => {
    if (!("serviceWorker" in navigator)) {
      toast.warning("Thiết bị không hỗ trợ Service Worker");
      return;
    }
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast.info("Chưa có Service Worker");
        return;
      }
      // Kích hoạt kiểm tra bản mới
      await reg.update();
      // Nếu có worker chờ, yêu cầu skipWaiting
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        toast.info("Đang áp dụng phiên bản mới, vui lòng tải lại.", {
          action: {
            label: "Tải lại",
            onClick: () => window.location.reload(),
          },
        });
      } else {
        toast.info("Đã kiểm tra bản cập nhật.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Không thể cập nhật ứng dụng");
    } finally {
      setChecking(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 sm:left-auto sm:right-4 z-50">
      <Button
        onClick={checkAndUpdate}
        variant="secondary"
        className="shadow bg-secondary text-secondary-foreground"
        aria-label="Cập nhật ứng dụng"
        disabled={checking}
      >
        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
        <span className="ml-2">{checking ? "Đang kiểm tra..." : "Cập nhật ứng dụng"}</span>
      </Button>
    </div>
  );
};

export default UpdateAppButton;