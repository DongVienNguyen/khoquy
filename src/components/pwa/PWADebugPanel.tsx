"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wrench } from "lucide-react";

type CacheInfo = {
  name: string;
  entries: number;
};

function getRole(): string {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("loggedInStaff") : null;
    if (!raw) return "user";
    const parsed = JSON.parse(raw);
    return parsed?.role || "user";
  } catch {
    return "user";
  }
}

const PWADebugPanel: React.FC = () => {
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [online, setOnline] = React.useState(true);
  const [scope, setScope] = React.useState<string | null>(null);
  const [hasController, setHasController] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [cachesInfo, setCachesInfo] = React.useState<CacheInfo[]>([]);
  const [busy, setBusy] = React.useState(false);

  const loadSWStatus = React.useCallback(async () => {
    setOnline(navigator.onLine);
    setHasController(!!navigator.serviceWorker.controller);

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        setScope(reg.scope || null);
        setWaiting(!!reg.waiting);
        setInstalling(!!reg.installing);
      } else {
        setScope(null);
        setWaiting(false);
        setInstalling(false);
      }
    } catch {
      setScope(null);
      setWaiting(false);
      setInstalling(false);
    }
  }, []);

  const loadCachesInfo = React.useCallback(async () => {
    try {
      const names = await caches.keys();
      const details: CacheInfo[] = [];
      for (const name of names) {
        try {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          details.push({ name, entries: keys.length });
        } catch {
          details.push({ name, entries: -1 });
        }
      }
      setCachesInfo(details);
    } catch {
      setCachesInfo([]);
    }
  }, []);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([loadSWStatus(), loadCachesInfo()]);
  }, [loadSWStatus, loadCachesInfo]);

  React.useEffect(() => {
    setIsAdmin(getRole() === "admin");
    setOnline(navigator.onLine);
    refreshAll();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshAll]);

  if (!isAdmin) return null;

  const checkUpdate = async () => {
    if (!("serviceWorker" in navigator)) {
      toast.warning("Thiết bị không hỗ trợ Service Worker");
      return;
    }
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast.info("Chưa có Service Worker");
        return;
      }
      await reg.update();
      await loadSWStatus();
      toast.info("Đã kiểm tra bản cập nhật");
    } finally {
      setBusy(false);
    }
  };

  const applyUpdate = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      toast.info("Đang áp dụng phiên bản mới", {
        action: { label: "Tải lại", onClick: () => window.location.reload() },
      });
    } else {
      toast.info("Không có bản cập nhật đang chờ");
    }
  };

  const clearRuntimeCaches = async () => {
    setBusy(true);
    try {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("runtime-"))
          .map((n) => caches.delete(n))
      );
      toast.success("Đã xóa cache runtime");
      await loadCachesInfo();
    } finally {
      setBusy(false);
    }
  };

  const clearAllCaches = async () => {
    setBusy(true);
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      toast.success("Đã xóa toàn bộ cache");
      await loadCachesInfo();
    } finally {
      setBusy(false);
    }
  };

  const unregisterSW = async () => {
    setBusy(true);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      toast.success("Đã hủy đăng ký Service Worker, sẽ tải lại");
      setTimeout(() => window.location.reload(), 300);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-4 left-4 z-50">
        <Button
          variant="secondary"
          className="shadow bg-secondary text-secondary-foreground"
          onClick={() => {
            setOpen((v) => !v);
            if (!open) refreshAll();
          }}
          aria-label="PWA Debug"
        >
          <Wrench className="h-4 w-4" />
          <span className="ml-2">PWA Debug</span>
        </Button>
      </div>

      {open && (
        <div className="fixed bottom-16 left-4 z-50 w-[92%] sm:w-[420px] rounded-md border bg-background p-3 shadow-lg">
          <div className="space-y-2 text-sm">
            <div className="font-medium">Trạng thái</div>
            <div className="grid grid-cols-2 gap-2">
              <div>Online: {online ? "Có" : "Không"}</div>
              <div>Controller: {hasController ? "Có" : "Không"}</div>
              <div>Waiting: {waiting ? "Có" : "Không"}</div>
              <div>Installing: {installing ? "Có" : "Không"}</div>
              <div className="col-span-2 break-all">Scope: {scope || "-"}</div>
            </div>

            <div className="font-medium pt-2">Caches</div>
            <div className="space-y-1 max-h-40 overflow-auto pr-1">
              {cachesInfo.length === 0 ? (
                <div className="text-muted-foreground">Không có cache</div>
              ) : (
                cachesInfo.map((c) => (
                  <div key={c.name} className="flex items-center justify-between">
                    <span className="truncate">{c.name}</span>
                    <span className="text-muted-foreground">entries: {c.entries >= 0 ? c.entries : "?"}</span>
                  </div>
                ))
              )}
            </div>

            <div className="font-medium pt-2">Hành động</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={refreshAll} disabled={busy}>
                Làm mới
              </Button>
              <Button size="sm" variant="outline" onClick={checkUpdate} disabled={busy}>
                Kiểm tra cập nhật
              </Button>
              <Button size="sm" variant="outline" onClick={applyUpdate} disabled={busy}>
                Áp dụng cập nhật
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()} disabled={busy}>
                Tải lại
              </Button>
              <Button size="sm" variant="destructive" onClick={clearRuntimeCaches} disabled={busy}>
                Xóa runtime cache
              </Button>
              <Button size="sm" variant="destructive" onClick={clearAllCaches} disabled={busy}>
                Xóa toàn bộ cache
              </Button>
              <Button size="sm" variant="destructive" onClick={unregisterSW} disabled={busy}>
                Unregister SW
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWADebugPanel;