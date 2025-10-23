"use client";

import React from "react";
import { supabase, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";

const AI_SETTINGS_KEY = "ai_settings_v1";

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

function todayStrGMT7(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export default function SyncRunner() {
  const timerRef = React.useRef<number | null>(null);
  const isSyncingRef = React.useRef<boolean>(false);
  const lastSettingsJSONRef = React.useRef<string>("");

  const [enabled, setEnabled] = React.useState<boolean>(false);
  const [intervalMinutes, setIntervalMinutes] = React.useState<number>(2);

  const stopRunner = React.useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runOnce = React.useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const date = todayStrGMT7();
      const { data, error } = await supabase.functions.invoke("sync-asset-transactions", {
        body: { date },
        headers: { Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}` },
      });
      if (!error) {
        // Kết quả thống kê
        const res: any = data?.data ?? data;
        console.log("Sync OK", res);
      } else {
        console.warn("Sync error", error);
      }
    } catch (e) {
      console.warn("Sync exception", e);
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  const startRunner = React.useCallback(() => {
    stopRunner();
    if (!enabled) return;
    // Chạy ngay một lượt
    runOnce();
    // Thiết lập interval
    timerRef.current = window.setInterval(() => {
      runOnce();
    }, Math.max(1, Math.min(5, intervalMinutes)) * 60 * 1000);
  }, [enabled, intervalMinutes, runOnce, stopRunner]);

  React.useEffect(() => {
    // Chỉ chạy cho admin
    const role = getRole();
    if (role !== "admin") return;

    const loadSettings = async () => {
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", AI_SETTINGS_KEY)
          .limit(1)
          .maybeSingle();

        let json = "";
        let obj: any = null;
        if (data?.setting_value) {
          json = data.setting_value;
          obj = JSON.parse(json);
        } else {
          const saved = localStorage.getItem(AI_SETTINGS_KEY);
          if (saved) {
            json = saved;
            obj = JSON.parse(saved);
          }
        }
        lastSettingsJSONRef.current = json || "";
        setEnabled(!!obj?.external_sync_enabled);
        const mins = Number(obj?.external_sync_interval_minutes || 2);
        setIntervalMinutes([1, 2, 3, 4, 5].includes(mins) ? mins : 2);
      } catch {
        // ignore
      }
    };

    loadSettings();

    // Theo dõi thay đổi localStorage để phản ứng nhanh khi người dùng lưu trong AI Settings
    const watcher = window.setInterval(() => {
      try {
        const saved = localStorage.getItem(AI_SETTINGS_KEY) || "";
        if (saved && saved !== lastSettingsJSONRef.current) {
          lastSettingsJSONRef.current = saved;
          const obj = JSON.parse(saved);
          setEnabled(!!obj?.external_sync_enabled);
          const mins = Number(obj?.external_sync_interval_minutes || 2);
          setIntervalMinutes([1, 2, 3, 4, 5].includes(mins) ? mins : 2);
        }
      } catch {
        // ignore
      }
    }, 10000); // kiểm tra mỗi 10 giây

    return () => {
      window.clearInterval(watcher);
      stopRunner();
    };
  }, [stopRunner]);

  React.useEffect(() => {
    startRunner();
  }, [enabled, intervalMinutes, startRunner]);

  // Kích hoạt đồng bộ khi có mạng trở lại và khi tab quay lại foreground
  React.useEffect(() => {
    const onOnline = () => {
      if (enabled) {
        runOnce();
      }
    };
    const onVis = () => {
      if (enabled && document.visibilityState === "visible") {
        runOnce();
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, runOnce]);

  return null;
}