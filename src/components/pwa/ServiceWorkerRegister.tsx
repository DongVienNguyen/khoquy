"use client";

import { useEffect } from "react";

const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    let regRef: ServiceWorkerRegistration | null = null;

    const onVis = () => {
      if (document.visibilityState === "visible" && regRef) {
        regRef.update?.();
      }
    };

    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          regRef = reg;
          // Khi quay lại tab → check update
          document.addEventListener("visibilitychange", onVis);
          // Tự reload 1 lần khi SW mới kích hoạt
          navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
          console.log("[PWA] Service worker registered:", reg.scope);
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
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
};

export default ServiceWorkerRegister;