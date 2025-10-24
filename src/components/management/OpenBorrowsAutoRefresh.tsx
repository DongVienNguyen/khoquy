"use client";

import { useEffect } from "react";
import { edgeInvoke } from "@/lib/edge-invoke";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const MIN_GAP_BETWEEN_RUNS_MS = 10 * 60 * 1000; // tránh gọi trùng khi nhiều tab (10 phút)

export default function OpenBorrowsAutoRefresh() {
  useEffect(() => {
    let cancelled = false;

    const maybeRefresh = async () => {
      if (cancelled) return;

      // Chặn gọi trùng nếu nhiều tab cùng mở
      const now = Date.now();
      const lastRun = Number(localStorage.getItem("open_borrows_refresh_last_run") || "0");
      if (now - lastRun < MIN_GAP_BETWEEN_RUNS_MS) {
        return;
      }
      localStorage.setItem("open_borrows_refresh_last_run", String(now));

      // Lấy lần refresh gần nhất từ DB
      const res = await edgeInvoke<string | null>("asset-transactions", { action: "get_open_borrows_last_refresh" });
      const last = res?.data ? new Date(String(res.data)) : null;

      const need = !last || (now - last.getTime()) >= FOUR_HOURS_MS;
      if (need) {
        await edgeInvoke("refresh-open-borrows", {});
        localStorage.setItem("open_borrows_refresh_last_run", String(Date.now()));
      }
    };

    // Kiểm tra ngay khi khởi chạy
    maybeRefresh();

    // Lặp lại mỗi 4 giờ
    const intervalId = window.setInterval(maybeRefresh, FOUR_HOURS_MS);

    // Khi tab từ ẩn -> hiện, kiểm tra lại
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}