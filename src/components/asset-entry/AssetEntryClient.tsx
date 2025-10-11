"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { 
  Package, Building2 as Building, CheckCircle, AlertCircle, 
  Plus, Minus, ChevronDown, ChevronUp, CalendarDays as CalendarIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { edgeInvoke, friendlyErrorMessage } from "@/lib/edge-invoke";
import AssetCodeInputRow from "@/components/asset-entry/AssetCodeInputRow";

type SafeStaff = {
  id: string;
  username: string;
  staff_name: string;
  email: string | null;
  role: "admin" | "user";
  department: "QLN" | "CMT8" | "NS" | "ĐS" | "LĐH" | "DVKH" | string | null;
  account_status: "active" | "locked";
};

type AssetTx = {
  id: string;
  room: string;
  asset_year: number;
  asset_code: number;
  transaction_type: "Xuất kho" | "Mượn TS" | "Thay bìa";
  transaction_date: string;
  parts_day: "Sáng" | "Chiều";
  note: string | null;
  staff_code: string;
  notified_at: string;
  is_deleted: boolean;
  created_date: string;
  updated_date: string;
};

// Hoist hằng số & regex
const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"] as const;
const ASSET_REGEX = /^\d{1,4}\.\d{2}$/;
const RE_COMMAS_SLASHES = /[,/\\]/g;
const RE_NON_NUM_DOT = /[^0-9.]/g;
const RE_SECOND_DOT = /(\..*)\./g;
const RE_YEAR_TRUNC = /(\.\d\d)\d+$/;
const RE_CODE_MAX = /(\d{4})\d+/;

function getLoggedInStaff(): SafeStaff | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("loggedInStaff") : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string") return parsed as SafeStaff;
    return null;
  } catch {
    return null;
  }
}

export default function AssetEntryClient() {
  const router = useRouter();

  const [currentStaff, setCurrentStaff] = useState<SafeStaff | null>(null);
  // UI toggles
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const [showAllAssets, setShowAllAssets] = useState<boolean>(false);

  const [formData, setFormData] = useState<{
    transaction_date: Date | null;
    parts_day: "" | "Sáng" | "Chiều";
    room: string;
    transaction_type: "" | "Xuất" | "Mượn" | "Khác";
    note: string;
  }>({
    transaction_date: null,
    parts_day: "",
    room: "QLN",
    transaction_type: "Khác",
    note: "",
  });

  const [multipleAssets, setMultipleAssets] = useState<string[]>([""]);
  const [message, setMessage] = useState<{ type: "" | "success" | "error"; text: string }>({ type: "", text: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [isRestrictedTime, setIsRestrictedTime] = useState(false);

  const [listOpen, setListOpen] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const [isAiConfirmOpen, setIsAiConfirmOpen] = useState(false);
  const [aiNeedsConfirm, setAiNeedsConfirm] = useState<{ options: Record<string, string[]>; selections: Record<string, string> } | null>(null);

  const assetInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timeCheckTimerRef = useRef<number | null>(null);
  const todayRef = useRef<HTMLDivElement | null>(null);

  const [isMounted, setIsMounted] = useState(false);

  // Auto-scroll infra: visualViewport & timers
  const vvRef = useRef<any>(typeof window !== "undefined" ? (window as any).visualViewport : null);
  const pollIdRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  // Mỗi ô nhập chỉ kích hoạt cuộn 1 lần khi gõ ký tự đầu tiên
  const [firstTypeTriggered, setFirstTypeTriggered] = useState<boolean[]>([false]);
  const firstTypeTriggeredRef = useRef<boolean[]>([false]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const formatDateShort = React.useCallback((date: Date | null) => {
    if (!date) return "Chọn ngày";
    const d = new Date(date);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }, []);

  const getDefaultPartsDay = useCallback((room: string): "Sáng" | "Chiều" => {
    const now = new Date();
    const gmt7Hour = (now.getUTCHours() + 7) % 24;
    const gmt7Minute = now.getUTCMinutes();
    const hhmm = gmt7Hour * 100 + gmt7Minute;

    if (hhmm >= 800 && hhmm <= 1245) return "Chiều";
    if (hhmm >= 1300 || hhmm <= 745) {
      if (["QLN", "DVKH"].includes(room)) return "Sáng";
      if (["CMT8", "NS", "ĐS", "LĐH"].includes(room)) return "Chiều";
    }
    return "Sáng";
  }, []);

  const calculateDefaultValues = useCallback((staff: SafeStaff): {
    transaction_date: Date;
    parts_day: "" | "Sáng" | "Chiều";
    room: string;
    transaction_type: "" | "Xuất" | "Mượn" | "Khác";
    note: string;
  } => {
    const now = new Date();
    const gmt7Hour = (now.getUTCHours() + 7) % 24;
    const dow = now.getDay();
    let defaultDate = new Date(now);

    if ((dow === 5 && gmt7Hour >= 13) || dow === 6 || dow === 0) {
      const daysUntilMonday = ((8 - dow) % 7) || 7;
      defaultDate = new Date(now.getTime() + (daysUntilMonday === 7 ? 1 : daysUntilMonday) * 24 * 60 * 60 * 1000);
    } else if (gmt7Hour >= 13) {
      defaultDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else {
      defaultDate = now;
    }

    const defaultRoom = "QLN";

    return {
      transaction_date: defaultDate,
      parts_day: getDefaultPartsDay(defaultRoom),
      room: defaultRoom,
      transaction_type: "Khác",
      note: defaultRoom === "QLN" ? "" : "Ship PGD",
    };
  }, [getDefaultPartsDay]);

  const minDate = useMemo(() => {
    const d = formData.transaction_date ? new Date(formData.transaction_date) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [formData.transaction_date]);

  useEffect(() => {
    const staff = getLoggedInStaff();
    if (!staff) {
      router.replace("/sign-in");
      return;
    }
    setCurrentStaff(staff);
    setFormData(calculateDefaultValues(staff));
    try {
      window.dispatchEvent(new Event("asset-entry:ready"));
    } catch {}
  }, [router, calculateDefaultValues]);

  // Giữ thông báo bền vững: không auto-clear nữa

  // Tạm dừng interval khi tab ẩn, khởi động lại khi visible
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const gmt7Hour = (now.getUTCHours() + 7) % 24;
      const minutes = now.getUTCMinutes();
      const totalMin = gmt7Hour * 60 + minutes;
      if (currentStaff?.role === "admin") {
        setIsRestrictedTime(false);
      } else {
        setIsRestrictedTime((totalMin >= 465 && totalMin <= 485) || (totalMin >= 765 && totalMin <= 785));
      }
    };
    const startTimer = () => {
      if (timeCheckTimerRef.current) return;
      checkTime();
      timeCheckTimerRef.current = window.setInterval(checkTime, 60000);
    };
    const stopTimer = () => {
      if (timeCheckTimerRef.current) {
        clearInterval(timeCheckTimerRef.current);
        timeCheckTimerRef.current = null;
      }
    };

    const onVisChange = () => {
      if (document.hidden) stopTimer();
      else startTimer();
    };

    startTimer();
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [currentStaff]);

  // Helper xác định phần tử có focus là input/textarea/select
  const isFocusable = (el: Element | null) => {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };
  const clearScrollTimers = () => {
    if (pollIdRef.current) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  };
  const scrollTargetBottomFit = (targetEl: HTMLElement | null | undefined, smooth = true) => {
    const el = targetEl ?? (document.activeElement as HTMLElement | null) ?? undefined;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const absTop = window.pageYOffset + rect.top;
    const absBottom = absTop + rect.height;
    const viewportHeight = vvRef.current?.height ?? window.innerHeight;
    const margin = 12; // chừa khoảng để không dính sát bàn phím
    const targetY = Math.max(0, absBottom - (viewportHeight - margin));
    window.scrollTo({ top: targetY, behavior: smooth ? "smooth" : "auto" });
  };
  const triggerScrollRoutine = React.useCallback((targetEl?: HTMLElement | null) => {
    clearScrollTimers();
    // Cuộn ngay lập tức để đảm bảo đẩy trang lên ngay lần đầu
    scrollTargetBottomFit(targetEl ?? (document.activeElement as HTMLElement | null), false);
    const initialHeight = vvRef.current?.height ?? window.innerHeight;
    let lastHeight = initialHeight;
    // Poll để bắt khoảnh khắc bàn phím đổi chiều cao, cuộn lại ngay
    pollIdRef.current = window.setInterval(() => {
      const h = vvRef.current?.height ?? window.innerHeight;
      if (Math.abs(h - lastHeight) > 1 || Math.abs(h - initialHeight) > 1) {
        lastHeight = h;
        scrollTargetBottomFit(targetEl ?? (document.activeElement as HTMLElement | null), false);
      }
    }, 60);
    // Sau khi ổn định, chốt vị trí bằng cuộn mượt
    settleTimeoutRef.current = window.setTimeout(() => {
      clearScrollTimers();
      scrollTargetBottomFit(targetEl ?? (document.activeElement as HTMLElement | null), true);
      setTimeout(() => scrollTargetBottomFit(targetEl ?? (document.activeElement as HTMLElement | null), true), 200);
    }, 800);
  }, []);

  // Kích hoạt cuộn khi người dùng gõ ký tự đầu tiên trong một ô (kể cả số)
  const handleFirstType = React.useCallback((index: number) => {
    // Guard: chỉ trigger 1 lần/ô kể cả nhiều event cùng lúc (beforeinput/keydown/change)
    while (firstTypeTriggeredRef.current.length <= index) firstTypeTriggeredRef.current.push(false);
    if (firstTypeTriggeredRef.current[index]) return;
    firstTypeTriggeredRef.current[index] = true;
    setFirstTypeTriggered((prev) => {
      const next = prev.slice();
      while (next.length <= index) next.push(false);
      next[index] = true;
      return next.length > 0 ? next : [true];
    });
    const target = assetInputRefs.current[index] ?? (document.activeElement as HTMLElement | null);
    triggerScrollRoutine(target || undefined);
  }, [triggerScrollRoutine]);

  // Auto scroll khi bàn phím mở: dùng triggerScrollRoutine để cuộn ngay lần đầu focus
  useEffect(() => {
    const onFocusIn = () => {
      if (isFocusable(document.activeElement)) {
        triggerScrollRoutine(document.activeElement as HTMLElement);
      }
    };
    const onVVResize = () => {
      if (isFocusable(document.activeElement)) {
        triggerScrollRoutine(document.activeElement as HTMLElement);
      }
    };
    const onVVGeometryChange = () => {
      if (isFocusable(document.activeElement)) {
        triggerScrollRoutine(document.activeElement as HTMLElement);
      }
    };
    window.addEventListener("focusin", onFocusIn, { passive: true });
    window.addEventListener("resize", onVVResize, { passive: true });
    const vv = vvRef.current;
    if (vv && typeof vv.addEventListener === "function") {
      vv.addEventListener("resize", onVVResize, { passive: true });
      vv.addEventListener("geometrychange", onVVGeometryChange, { passive: true });
    }
    return () => {
      clearScrollTimers();
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("resize", onVVResize);
      if (vv && typeof vv.removeEventListener === "function") {
        vv.removeEventListener("resize", onVVResize);
        vv.removeEventListener("geometrychange", onVVGeometryChange);
      }
    };
  }, [triggerScrollRoutine]);

  const requiresNoteDropdown = useMemo(() => ["CMT8", "NS", "ĐS", "LĐH"].includes(formData.room), [formData.room]);

  const validateAssetFormat = useCallback((value: string) => ASSET_REGEX.test(value.trim()), []);
  const parseAssetCode = useCallback((value: string) => {
    if (!validateAssetFormat(value)) return null;
    const [code, year] = value.split(".");
    return { asset_code: parseInt(code, 10), asset_year: parseInt(year, 10) };
  }, [validateAssetFormat]);
  const isAssetValid = useCallback((value: string) => {
    const v = (value || "").trim();
    if (!v) return false;
    if (!ASSET_REGEX.test(v)) return false;
    const parsed = parseAssetCode(v);
    if (!parsed) return false;
    return parsed.asset_year >= 20 && parsed.asset_year <= 99;
  }, [parseAssetCode]);

  const handleAssetChange = useCallback((index: number, value: string) => {
    const normalized = String(value)
      .replace(RE_COMMAS_SLASHES, ".")
      .replace(RE_NON_NUM_DOT, "")
      .replace(RE_SECOND_DOT, "$1")
      .replace(RE_YEAR_TRUNC, "$1")
      .replace(RE_CODE_MAX, "$1");

    setMultipleAssets((prev) => {
      const next = [...prev];
      const wasEmptyBefore = (next[index] || "").trim() === "";
      if (next[index] === normalized) return prev; // tránh setState nếu không đổi
      next[index] = normalized;

      // Auto-append chỉ khi cần
      let appended = false;
      if (normalized.length >= 6 && next.length === index + 1) {
        next.push("");
        appended = true;
      }
      // Thu gọn nếu đang rỗng
      if (normalized.length < 6) {
        while (next.length > index + 1 && next[next.length - 1].trim() === "") {
          next.pop();
        }
      }

      // Kích hoạt cuộn đúng 1 lần/ô khi gõ ký tự đầu tiên
      setFirstTypeTriggered((prevTrig) => {
        let trigNext = prevTrig.slice();
        if (appended && prevTrig.length < next.length) {
          trigNext = [...prevTrig, false];
          // Đồng bộ guard ref khi auto-append
          firstTypeTriggeredRef.current.push(false);
        }
        const becameNonEmpty = wasEmptyBefore && normalized.trim() !== "";
        if (becameNonEmpty && !prevTrig[index]) {
          // Ưu tiên cuộn theo đúng ô input đang gõ (nếu ref có), fallback activeElement
          const target = assetInputRefs.current[index] ?? (document.activeElement as HTMLElement | null);
          triggerScrollRoutine(target);
          trigNext[index] = true;
          // Cập nhật guard ref để không trigger lại
          while (firstTypeTriggeredRef.current.length <= index) firstTypeTriggeredRef.current.push(false);
          firstTypeTriggeredRef.current[index] = true;
        }
        if (trigNext.length > next.length) {
          trigNext = trigNext.slice(0, next.length);
        }
        return trigNext.length > 0 ? trigNext : [false];
      });

      return next.length > 0 ? next : [""];
    });
  }, [triggerScrollRoutine]);

  const addAssetField = useCallback(() => {
    setMultipleAssets((prev) => {
      const next = [...prev, ""];
      setFirstTypeTriggered((prevTrig) => [...prevTrig, false]);
      firstTypeTriggeredRef.current.push(false);
      return next;
    });
  }, []);

  const removeAssetField = useCallback((index: number) => {
    setMultipleAssets((prev) => {
      if (prev.length > 1) {
        const next = prev.filter((_, i) => i !== index);
        setFirstTypeTriggered((prevTrig) => {
          const arr = prevTrig.filter((_, i) => i !== index);
          return arr.length > 0 ? arr : [false];
        });
        // Đồng bộ guard ref khi xóa ô
        firstTypeTriggeredRef.current = firstTypeTriggeredRef.current.filter((_, i) => i !== index);
        if (firstTypeTriggeredRef.current.length === 0) firstTypeTriggeredRef.current = [false];
        return next;
      }
      setFirstTypeTriggered([false]);
      firstTypeTriggeredRef.current = [false];
      return [""];
    });
  }, []);

  const handleRoomChange = useCallback((selectedRoom: string) => {
    setFormData((prev) => ({
      ...prev,
      room: selectedRoom,
      note: selectedRoom === "QLN" ? "" : "Ship PGD",
      parts_day: getDefaultPartsDay(selectedRoom),
    }));
  }, [getDefaultPartsDay]);

  const getUtcNowIso = useCallback(() => new Date().toISOString(), []);
  const getYmd = useCallback((d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const validateAllAssets = useCallback(() => {
    const filled = multipleAssets.filter((a) => a.trim());
    if (filled.length === 0) {
      setMessage({ type: "error", text: "Hãy nhập ít nhất một mã tài sản!" });
      return false;
    }
    for (const asset of filled) {
      if (!ASSET_REGEX.test(asset.trim())) {
        setMessage({ type: "error", text: `Định dạng không đúng: ${asset}. Vui lòng nhập theo [Mã TS].[Năm TS]` });
        return false;
      }
      const parsed = parseAssetCode(asset);
      if (parsed && (parsed.asset_year < 20 || parsed.asset_year > 99)) {
        setMessage({ type: "error", text: `Năm tài sản phải từ 20 đến 99 cho mã: ${asset}` });
        return false;
      }
    }
    return true;
  }, [multipleAssets, parseAssetCode]);

  const isFormValid = useMemo(() => {
    const basicValid = !!formData.room && !!formData.transaction_date && !!formData.parts_day && !!formData.transaction_type;
    const noteValid = formData.room === "QLN" || !requiresNoteDropdown || (requiresNoteDropdown && !!formData.note);
    const filledAssets = multipleAssets.filter((a) => a.trim());
    return basicValid && noteValid && filledAssets.length > 0 && filledAssets.every(isAssetValid);
  }, [formData, requiresNoteDropdown, multipleAssets, isAssetValid]);

  const handleOpenConfirm = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isRestrictedTime && currentStaff?.role !== "admin") {
      setMessage({ type: "error", text: "Không thể lưu dữ liệu trong giờ nghỉ. Vui lòng nhắn Zalo!" });
      return;
    }
    if (!validateAllAssets()) return;
    setIsConfirmOpen(true);
  }, [isRestrictedTime, currentStaff, validateAllAssets]);

  function simpleHash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return "k" + Math.abs(h).toString(36);
  }

  const performSubmit = useCallback(async () => {
    setIsConfirmOpen(false);
    if (isRestrictedTime && currentStaff?.role !== "admin") {
      setMessage({ type: "error", text: "Không thể lưu dữ liệu trong giờ nghỉ. Vui lòng nhắn Zalo!" });
      return;
    }
    if (!validateAllAssets() || !currentStaff || !formData.transaction_date) return;

    setIsLoading(true);
    // Giữ thông báo hiện tại cho đến khi có kết quả mới

    const txDate = getYmd(formData.transaction_date);

    const normalizedType =
      formData.transaction_type === "Xuất"
        ? "Xuất kho"
        : formData.transaction_type === "Mượn"
        ? "Mượn TS"
        : "Thay bìa";

    const filledAssets = multipleAssets.filter((a) => a.trim());
    const transactions = filledAssets.map((asset) => {
      const parsed = parseAssetCode(asset)!;
      const payload: any = {
        transaction_date: txDate,
        parts_day: formData.parts_day,
        room: formData.room,
        transaction_type: normalizedType,
        asset_year: parsed.asset_year,
        asset_code: parsed.asset_code,
        note: formData.note || null,
        // notified_at do server set để ổn định thời gian
      };
      if (!requiresNoteDropdown && formData.room !== "QLN") {
        delete payload.note;
      }
      return payload;
    });

    const codesForKey = transactions.map((t) => `${t.asset_code}.${t.asset_year}`).sort().join(",");
    const idemKey = simpleHash(`${currentStaff.username}|${formData.room}|${formData.parts_day}|${txDate}|${codesForKey}`);

    const result = await edgeInvoke<AssetTx[]>("asset-transactions", {
      action: "create",
      staff_username: currentStaff.username,
      staff_email: currentStaff.email,
      staff_name: currentStaff.staff_name,
      transactions,
      idempotency_key: idemKey,
    });

    if (!result.ok) {
      setIsLoading(false);
      toast.error(friendlyErrorMessage(result.error));
      setMessage({ type: "error", text: friendlyErrorMessage(result.error) });
      return;
    }

    const created: AssetTx[] = result.data || [];
    const codesList = created.map((t) => `${t.asset_code}.${t.asset_year}`);
    const firstFew = codesList.slice(0, 5).join(", ");
    const moreCount = codesList.length > 5 ? `, ... (+${codesList.length - 5})` : "";

    setMessage({
      type: "success",
      text: `✅ Đã lưu ${created.length} tài sản cho ${formData.room} (${formData.parts_day} - ${txDate}). Mã TS: ${firstFew}${moreCount}.`,
    });
    toast.success("Đã gửi thông báo trong ứng dụng");

    setFormData(calculateDefaultValues(currentStaff));
    setMultipleAssets([""]);
    setFirstTypeTriggered([false]);
    firstTypeTriggeredRef.current = [false];
    setIsLoading(false);

    try {
      window.dispatchEvent(new Event("asset:submitted"));
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch {}
  }, [isRestrictedTime, currentStaff, formData, multipleAssets, requiresNoteDropdown, getYmd, parseAssetCode, calculateDefaultValues, validateAllAssets]);

  const fetchMyToday = useCallback(async () => {
    const staff = currentStaff;
    if (!staff) return;
    const res = await edgeInvoke<AssetTx[]>("asset-transactions", { action: "list_mine_today", staff_username: staff.username });
    if (!res.ok) {
      toast.error(friendlyErrorMessage(res.error));
      return;
    }
    // hiển thị ở component con, đây chỉ để trigger refresh
    const rows = (res.data as AssetTx[]) || [];
    const now = new Date();
    const gmt7Now = new Date(now.getTime() + 7 * 3600 * 1000);
    const todayStr = `${gmt7Now.getUTCFullYear()}-${String(gmt7Now.getUTCMonth() + 1).padStart(2, "0")}-${String(gmt7Now.getUTCDate()).padStart(2, "0")}`;
    void rows;
    void todayStr;
  }, [currentStaff]);

  useEffect(() => {
    if (currentStaff) {
      if (listOpen) fetchMyToday();
    }
  }, [currentStaff, listOpen, fetchMyToday]);

  const updateNote = useCallback(async (row: AssetTx) => {
    const newNote = prompt("Nhập ghi chú mới", row.note ?? "") ?? null;
    if (newNote === null) return;
    const res = await edgeInvoke("asset-transactions", {
      action: "update_note",
      id: row.id,
      note: newNote,
      editor_username: currentStaff?.username || "",
    });
    if (!res.ok) {
      toast.error(friendlyErrorMessage(res.error));
      return;
    }
    toast.success("Đã cập nhật ghi chú");
  }, [currentStaff]);

  const removeTransaction = useCallback(async (id: string) => {
    const res = await edgeInvoke("asset-transactions", {
      action: "soft_delete",
      id,
      deleted_by: currentStaff?.username || "",
    });
    if (!res.ok) {
      toast.error(friendlyErrorMessage(res.error));
      return;
    }
    toast.success("Đã xóa (mềm)");
  }, [currentStaff]);

  const [datePickerMounted, setDatePickerMounted] = useState(false);
  const [aiMounted, setAiMounted] = useState(false);

  const MyTodaySubmissionsLazy = dynamic(() => import("@/components/asset-entry/MyTodaySubmissions"), {
    ssr: false,
    loading: () => <div className="mt-4 text-sm text-muted-foreground">Đang tải danh sách của bạn...</div>,
  });
  const DatePickerLazy = dynamic(() => import("@/components/asset-entry/DatePickerLazy"), {
    ssr: false,
    loading: () => (
      <div className="h-10 flex items-center justify-center border rounded-md text-sm text-muted-foreground">
        Đang tải lịch...
      </div>
    ),
  });
  const AssetEntryAIDialogLazy = dynamic(() => import("@/components/asset-entry/AssetEntryAIDialogLazy"), {
    ssr: false,
    loading: () => <div className="text-sm text-muted-foreground">Đang tải AI...</div>,
  });

  return (
    <div className="w-full">
      {/* Khi chưa mount trên client, trả về khung rỗng để tránh SSR/CSR lệch nhau */}
      {!isMounted ? (
        <div className="mx-auto max-w-4xl p-4 space-y-4 pb-24 md:pb-4">
          <div className="rounded-lg bg-card border p-6 shadow-sm">
            <div className="h-6 w-40 bg-muted rounded" />
          </div>
          <div className="rounded-lg bg-card border p-6 shadow-sm">
            <div className="h-6 w-56 bg-muted rounded" />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl p-4 space-y-4 pb-24 md:pb-4">
          <div className="rounded-lg bg-card border p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-green-600 to-green-700 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold">Thông báo lấy TS</h1>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOptions((v) => !v)}
                    className="ml-2"
                  >
                    {showOptions ? "Ẩn" : "Hiện"}
                  </Button>
                </div>
                <p className="text-muted-foreground mt-1">
                  {currentStaff?.role === "admin"
                    ? "Không giới hạn thời gian cho Admin"
                    : "Khung giờ 7:45-8:05 và 12:45-13:05 hãy nhắn Zalo vì đã chốt DS"}
                </p>
              </div>
            </div>

            {showOptions && (
              <div className="mt-6 rounded-md bg-green-50 text-green-700 p-3 text-sm" id="instruction-section">
                Từ <strong>Phải sang Trái</strong>: 2 ký tự thứ 9 và 10 là Năm TS: 24; 4 ký tự cuối là Mã TS: 259 - vd: 0424102470200259
              </div>
            )}

            <form onSubmit={handleOpenConfirm} className="mt-6 space-y-6">
              {showOptions && (
              <div>
                <Label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Building className="text-muted-foreground" size={18} />
                  Tài sản của phòng
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select value={formData.room} onValueChange={handleRoomChange}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                    <SelectContent>
                      {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  {formData.room === "QLN" ? (
                    <Textarea
                      rows={2}
                      placeholder="Ghi chú (tùy chọn)"
                      value={formData.note}
                      onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
                    />
                  ) : requiresNoteDropdown ? (
                    <Select value={formData.note} onValueChange={(v) => setFormData((p) => ({ ...p, note: v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Chọn ghi chú" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Ship PGD">Ship PGD</SelectItem>
                        <SelectItem value="Lấy ở CN">Lấy ở CN</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </div>
              )}

              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <CalendarIcon className="text-muted-foreground" size={18} /> Buổi và ngày lấy TS: (tuần khác mới cần chọn ngày)
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                    <div className="flex items-center gap-1">
                      <Checkbox
                        id="session-sang"
                        checked={formData.parts_day === "Sáng"}
                        onCheckedChange={(v: CheckedState) =>
                          setFormData((p) => ({ ...p, parts_day: v ? "Sáng" : (p.parts_day === "Sáng" ? "" : p.parts_day) }))
                        }
                      />
                      <Label htmlFor="session-sang" className="text-sm">Sáng</Label>
                    </div>
                  </div>
                  <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                    <div className="flex items-center gap-1">
                      <Checkbox
                        id="session-chieu"
                        checked={formData.parts_day === "Chiều"}
                        onCheckedChange={(v: CheckedState) =>
                          setFormData((p) => ({ ...p, parts_day: v ? "Chiều" : (p.parts_day === "Chiều" ? "" : p.parts_day) }))
                        }
                      />
                      <Label htmlFor="session-chieu" className="text-sm">Chiều</Label>
                    </div>
                  </div>

                  {!datePickerMounted ? (
                    <Button variant="outline" className="h-10 w-full justify-center" onClick={() => setDatePickerMounted(true)}>
                      {formatDateShort(formData.transaction_date)}
                    </Button>
                  ) : (
                    <Suspense fallback={<div className="h-10 flex items-center justify-center border rounded-md text-sm text-muted-foreground">Đang tải lịch...</div>}>
                      <DatePickerLazy
                        selected={formData.transaction_date}
                        minDate={minDate}
                        onSelect={(date) => setFormData((p) => ({ ...p, transaction_date: date }))}
                        formatDateShort={formatDateShort}
                        autoOpen
                      />
                    </Suspense>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                    <div className="flex items-center gap-1">
                      <Checkbox
                        id="type-khac"
                        checked={formData.transaction_type === "Khác"}
                        onCheckedChange={(v: CheckedState) => v && setFormData((p) => ({ ...p, transaction_type: "Khác" }))}
                      />
                      <Label htmlFor="type-khac" className="text-sm">Khác</Label>
                    </div>
                  </div>
                  <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                    <div className="flex items-center gap-1">
                      <Checkbox
                        id="type-xuat"
                        checked={formData.transaction_type === "Xuất"}
                        onCheckedChange={(v: CheckedState) => setFormData((p) => ({ ...p, transaction_type: v ? "Xuất" : "Khác" }))}
                      />
                      <Label htmlFor="type-xuat" className="text-sm">Xuất</Label>
                    </div>
                  </div>
                  <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                    <div className="flex items-center gap-1">
                      <Checkbox
                        id="type-muon"
                        checked={formData.transaction_type === "Mượn"}
                        onCheckedChange={(v: CheckedState) => setFormData((p) => ({ ...p, transaction_type: v ? "Mượn" : "Khác" }))}
                      />
                      <Label htmlFor="type-muon" className="text-sm">Mượn</Label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Nhập [Mã TS] . [Năm TS]:  (nhiều TS chọn nút AI nhập bằng hình)</Label>

                    {!aiMounted ? (
                      <Button type="button" variant="ghost" className="text-green-600 hover:text-green-700 flex items-center gap-1" onClick={() => setAiMounted(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 8a4 4 0 0 1 4-4h2l2-2h4l2 2h2a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                        <span className="text-base font-semibold">AI</span>
                      </Button>
                    ) : (
                      <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải AI...</div>}>
                        <AssetEntryAIDialogLazy
                          isAssetValid={isAssetValid}
                          setMultipleAssets={setMultipleAssets}
                          currentStaff={currentStaff}
                          onNeedConfirm={({ options, selections }) => {
                            setAiNeedsConfirm({ options, selections });
                            setIsAiConfirmOpen(true);
                          }}
                          setMessage={setMessage}
                          autoOpen
                        />
                      </Suspense>
                    )}
                  </div>

                  {(showAllAssets ? multipleAssets : multipleAssets.slice(0, 5)).map((val, idx) => {
                    const valid = isAssetValid(val);
                    return (
                      <AssetCodeInputRow
                        key={idx}
                        index={idx}
                        value={val}
                        isValid={valid}
                        onChange={handleAssetChange}
                        onAddRow={addAssetField}
                        onRemoveRow={removeAssetField}
                        inputRef={(el) => { assetInputRefs.current[idx] = el; }}
                        onFirstType={handleFirstType}
                        onTabNavigate={(i, dir) => {
                          if (dir === "next") {
                            const next = i + 1;
                            if (next >= multipleAssets.length) {
                              setMultipleAssets((prev) => {
                                const arr = [...prev, ""];
                                setFirstTypeTriggered((prevTrig) => [...prevTrig, false]);
                                return arr;
                              });
                              // Đồng bộ guard ref cho ô mới và cuộn sau khi focus
                              firstTypeTriggeredRef.current.push(false);
                              setTimeout(() => {
                                const el = assetInputRefs.current[next];
                                if (el) {
                                  el.focus();
                                  triggerScrollRoutine(el);
                                }
                              }, 0);
                            } else {
                              const el = assetInputRefs.current[next];
                              if (el) {
                                el.focus();
                                triggerScrollRoutine(el);
                              }
                            }
                          } else {
                            const prevIdx = i - 1;
                            if (prevIdx >= 0) {
                              const el = assetInputRefs.current[prevIdx];
                              if (el) {
                                el.focus();
                                triggerScrollRoutine(el);
                              }
                            }
                          }
                        }}
                        showRemove={multipleAssets.length > 1}
                      />
                    );
                  })}

                  {multipleAssets.length > 5 && (
                    <div className="flex justify-center">
                      <Button type="button" variant="ghost" onClick={() => setShowAllAssets((v) => !v)} className="text-slate-600 hover:text-slate-800">
                        {showAllAssets ? (<><ChevronUp className="w-4 h-4 mr-1" /> Thu gọn</>) : (<><ChevronDown className="w-4 h-4 mr-1" /> Xem thêm {multipleAssets.length - 5}</>)}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {isRestrictedTime && currentStaff?.role !== "admin" && (
                <Alert className="border-orange-200 bg-orange-50">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800">
                    <strong>Thông báo:</strong> Từ 7:45-8:05 và 12:45-13:05: Hãy nhắn Zalo.
                  </AlertDescription>
                </Alert>
              )}

              {message.text && (
                <Alert variant={message.type === "success" ? "default" : "destructive"} className={message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  {message.type === "success" ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4" />}
                  <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>{message.text}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" onClick={() => { setFormData(currentStaff ? calculateDefaultValues(currentStaff) : formData); setMultipleAssets([""]); setFirstTypeTriggered([false]); }} variant="outline">
                  Clear
                </Button>
                <Button type="submit" disabled={!isFormValid || isLoading || (isRestrictedTime && currentStaff?.role !== "admin")} className="h-10 px-4 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                  {isLoading ? "Đang gửi..." : "Gửi thông báo"}
                </Button>
              </div>

              {isConfirmOpen && (
                <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Xác nhận gửi thông báo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="font-medium">Buổi:</span> {formData.parts_day}</div>
                        <div><span className="font-medium">Ngày:</span> {formData.transaction_date ? new Date(formData.transaction_date).toLocaleDateString("vi-VN") : "-"}</div>
                      </div>
                      <div>
                        <span className="font-semibold">Danh sách mã TS ({multipleAssets.filter((a) => a.trim()).length}):</span>
                        <div className="mt-2 max-h-40 overflow-auto rounded border bg-slate-50 p-3">
                          {multipleAssets.filter((a) => a.trim()).map((a, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-base">
                              {isAssetValid(a) ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                              <span className={`${isAssetValid(a) ? "text-slate-800" : "text-red-600"} text-lg font-semibold`}>{a.replace(".", "/")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>Hủy</Button>
                      <Button onClick={performSubmit} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
                        {isLoading ? "Đang gửi..." : "Xác nhận & Gửi"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </form>
          </div>

          {isAiConfirmOpen && (
            <Dialog open={isAiConfirmOpen} onOpenChange={setIsAiConfirmOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Xác nhận mã cần làm rõ</DialogTitle>
                </DialogHeader>
                {aiNeedsConfirm && Object.keys(aiNeedsConfirm.options).length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Một số mã có nhiều cách diễn giải năm. Vui lòng chọn chính xác cho từng mã:
                    </p>
                    <div className="space-y-2">
                      {Object.entries(aiNeedsConfirm.options).map(([code, opts]) => (
                        <div key={code} className="grid grid-cols-3 items-center gap-2">
                          <Label className="col-span-1 text-sm">Mã {code}</Label>
                          <div className="col-span-2">
                            <Select
                              value={aiNeedsConfirm.selections[code] || ""}
                              onValueChange={(v) =>
                                setAiNeedsConfirm((prev) =>
                                  prev ? { options: prev.options, selections: { ...prev.selections, [code]: v } } : prev
                                )
                              }
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="Chọn mã đúng" /></SelectTrigger>
                              <SelectContent>
                                {opts.map((o) => (
                                  <SelectItem key={o} value={o}>{o}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setIsAiConfirmOpen(false)}>Để sau</Button>
                      <Button
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          if (!aiNeedsConfirm) return;
                          const chosen = Object.values(aiNeedsConfirm.selections || {}).filter(Boolean);
                          if (chosen.length > 0) {
                            setMultipleAssets((prev) => {
                              const existing = prev.filter((a) => a.trim());
                              const merged = Array.from(new Set([...existing, ...chosen]));
                              return merged.length > 0 ? merged : [""];
                            });
                            toast.success(`Đã thêm xác nhận cho ${chosen.length} mã.`);
                          }
                          setIsAiConfirmOpen(false);
                        }}
                      >
                        Xác nhận & Thêm
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Không có mã cần xác nhận.</div>
                )}
              </DialogContent>
            </Dialog>
          )}

          <div ref={todayRef} className="rounded-lg bg-card border p-6 shadow-sm">
            <button className="w-full flex items-center justify-between text-left" onClick={() => setListOpen((o) => !o)}>
              <span className="font-semibold">Thông báo đã gửi hôm nay</span>
              <span className="text-muted-foreground">{listOpen ? "Thu gọn" : "Mở"}</span>
            </button>

            {listOpen && (
              <Suspense fallback={<div className="mt-4 text-sm text-muted-foreground">Đang tải danh sách của bạn...</div>}>
                <MyTodaySubmissionsLazy />
              </Suspense>
            )}
          </div>

          {isMounted && (
            <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
              <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11"
                  onClick={() => {
                    setFormData(currentStaff ? calculateDefaultValues(currentStaff) : formData);
                    setMultipleAssets([""]);
                    setFirstTypeTriggered([false]);
                   firstTypeTriggeredRef.current = [false];
                  }}
                >
                  Clear
                </Button>
                <Button
                  className="flex-1 h-11 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  disabled={!isFormValid || isLoading || (isRestrictedTime && currentStaff?.role !== "admin")}
                  onClick={() => handleOpenConfirm()}
                >
                  {isLoading ? "Đang gửi..." : "Gửi thông báo"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}