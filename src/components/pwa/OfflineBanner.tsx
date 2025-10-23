"use client";

import React from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { WifiOff, Wifi } from "lucide-react";

const OfflineBanner: React.FC = () => {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const setInitial = () => setOnline(navigator.onLine);
    const handleOnline = () => {
      setOnline(true);
      toast.success("Đã kết nối lại", { icon: <Wifi className="h-4 w-4" /> });
    };
    const handleOffline = () => {
      setOnline(false);
      toast.warning("Mất kết nối internet");
    };

    setInitial();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    if (typeof window === "undefined") return;
    if (navigator.onLine) {
      toast.info("Đang làm mới...");
      window.location.reload();
    } else {
      toast.warning("Chưa có kết nối mạng");
    }
  };

  if (online) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center p-2">
      <div className="max-w-screen-sm w-full px-2">
        <Alert variant="destructive" className="shadow-md">
          <div className="flex items-start gap-3">
            <WifiOff className="h-5 w-5 mt-0.5" />
            <div className="flex-1">
              <AlertTitle>Mất kết nối mạng</AlertTitle>
              <AlertDescription>
                Một số tính năng có thể không hoạt động. Vui lòng kiểm tra lại kết nối của bạn.
              </AlertDescription>
            </div>
            <Button size="sm" variant="outline" onClick={handleRetry}>
              Thử lại
            </Button>
          </div>
        </Alert>
      </div>
    </div>
  );
};

export default OfflineBanner;