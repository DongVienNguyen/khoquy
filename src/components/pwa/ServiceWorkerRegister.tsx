"use client";

import { useEffect, useRef } from "react";

const ServiceWorkerRegister = () => {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service worker registered:", reg.scope);
            // Khi người dùng quay lại tab, kiểm tra và cập nhật SW
            const onVis = () => {
              if (document.visibilityState === "visible") {
                reg.update?.();
              }
            };
            document.addEventListener("visibilitychange", onVis);

            // Tự reload 1 lần khi SW mới kích hoạt
            let reloaded = false;
            const onControllerChange = () => {
              if (reloaded) return;
              reloaded = true;
              window.location.reload();
            };
            navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

            // cleanup khi unmount
            return () => {
              document.removeEventListener("visibilitychange", onVis);
              navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
            };
          })
          .catch((err) => {
            console.warn("[PWA] Service worker registration failed:", err);
          });
      };

      if (document.readyState === "complete") {
        register();
      } else {
        window.addEventListener("load", register);
        return () => window.removeEventListener("load", register);
      }
    }
  }, []);

  return null;
};

export default ServiceWorkerRegister;