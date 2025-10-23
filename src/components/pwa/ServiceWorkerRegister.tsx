"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let regRef: ServiceWorkerRegistration | null = null;

    const showUpdateToast = () => {
      toast.info("Có phiên bản mới của ứng dụng", {
        action: {
          label: "Tải lại",
          onClick: () => window.location.reload(),
        },
      });
    };

    const onVis = () => {
      if (document.visibilityState === "visible" && regRef) {
        regRef.update?.();
      }
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          regRef = reg;
          // Khi quay lại tab → check update
          document.addEventListener("visibilitychange", onVis);
          console.log("[PWA] Service worker registered:", reg.scope);

          // Nếu đã có worker mới sẵn sàng chờ activate
          if (reg.waiting && navigator.serviceWorker.controller) {
            showUpdateToast();
          }
          // Lắng nghe updatefound và trạng thái worker mới
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateToast();
              }
            });
          });
        })
        .catch((err) => {
          console.warn("[PWA] Service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
};

export default ServiceWorkerRegister;