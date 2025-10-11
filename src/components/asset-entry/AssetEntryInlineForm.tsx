"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { 
  Package, Building2 as Building, Camera, Upload, CheckCircle, AlertCircle, 
  Plus, Minus, ChevronDown, ChevronUp, CalendarDays as CalendarIcon, Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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

const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"] as const;

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

const AssetEntryInlineForm: React.FC = () => {
  const [currentStaff, setCurrentStaff] = useState<SafeStaff | null>(null);

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
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ stage: string; progress: number; total: number; detail: string }>({ stage: "", progress: 0, total: 0, detail: "" });
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const AI_MAX_IMAGES = 10;
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const [isAiConfirmOpen, setIsAiConfirmOpen] = useState(false);
  const [aiNeedsConfirm, setAiNeedsConfirm] = useState<{ options: Record<string, string[]>; selections: Record<string, string> } | null>(null);

  const assetInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const formatDateShort = useCallback((date: Date | null) => {
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
    setCurrentStaff(staff);
    if (staff) setFormData(calculateDefaultValues(staff));
  }, [calculateDefaultValues]);

  useEffect(() => {
    if (message.type === "success" && message.text) {
      const t = setTimeout(() => setMessage({ type: "", text: "" }), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

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
    checkTime();
    const id = setInterval(checkTime, 60000);
    return () => clearInterval(id);
  }, [currentStaff]);

  const requiresNoteDropdown = useMemo(() => ["CMT8", "NS", "ĐS", "LĐH"].includes(formData.room), [formData.room]);

  const validateAssetFormat = useCallback((value: string) => /^\d{1,4}\.\d{2}$/.test(value.trim()), []);
  const parseAssetCode = useCallback((value: string) => {
    if (!validateAssetFormat(value)) return null;
    const [code, year] = value.split(".");
    return { asset_code: parseInt(code, 10), asset_year: parseInt(year, 10) };
  }, [validateAssetFormat]);
  const isAssetValid = useCallback((value: string) => {
    const v = (value || "").trim();
    if (!v) return false;
    if (!validateAssetFormat(v)) return false;
    const parsed = parseAssetCode(v);
    if (!parsed) return false;
    return parsed.asset_year >= 20 && parsed.asset_year <= 99;
  }, [validateAssetFormat, parseAssetCode]);

  // Phân tích mã từ text: hỗ trợ "1234.24" và cả chuỗi số dài kiểu scanner
  const extractCodesFromText = useCallback((text: string): string[] => {
    const out: string[] = [];
    if (!text) return out;
    const t = String(text);
    // 1) Bắt mẫu có dấu chấm như 1234.24
    const dotRe = /(?<!\d)(\d{1,4})\.(\d{2})(?!\d)/g;
    let m: RegExpExecArray | null;
    while ((m = dotRe.exec(t)) !== null) {
      out.push(`${m[1]}.${m[2]}`);
    }
    // 2) Từ chuỗi số dài, tách 2 số cuối là năm, tối đa 4 số trước là mã
    const numRe = /(\d{5,})/g;
    while ((m = numRe.exec(t)) !== null) {
      const digits = m[1];
      const year = digits.slice(-2);
      const code = digits.slice(-6, -2).replace(/^0+/, "") || digits.slice(-6, -2);
      out.push(`${code}.${year}`);
    }
    // Chuẩn hóa, loại trùng, validate
    return Array.from(new Set(out)).map((s) => s.trim()).filter((s) => isAssetValid(s));
  }, [isAssetValid]);

  const handleBulkInsert = useCallback((startIndex: number, codes: string[]) => {
    if (!codes || codes.length === 0) return;
    setMultipleAssets((prev) => {
      const next = [...prev];
      while (next.length < startIndex + codes.length) next.push("");
      for (let i = 0; i < codes.length; i++) next[startIndex + i] = codes[i];
      if (next[next.length - 1].trim() !== "") next.push("");
      return next;
    });
    setTimeout(() => {
      const lastIdx = startIndex + codes.length - 1;
      const el = assetInputRefs.current[lastIdx];
      try { el?.focus(); } catch {}
    }, 0);
    toast.success(`Đã dán ${codes.length} mã tài sản.`);
  }, []);

  const handlePasteText = useCallback((index: number, text: string): boolean => {
    const codes = extractCodesFromText(text);
    if (codes.length > 1) {
      handleBulkInsert(index, codes);
      return true;
    }
    return false;
  }, [extractCodesFromText, handleBulkInsert]);

  const handleAssetChange = useCallback((index: number, value: string) => {
    const normalized = String(value).replace(/[,/\\]/g, ".");
    let scheduleNextFocusIndex: number | null = null;
    setMultipleAssets((prev) => {
      const next = [...prev];
      const prevVal = next[index] || "";
      const wasValid = isAssetValid(prevVal);
      const updated = normalized
        .replace(/[^0-9.]/g, "")
        .replace(/(\..*)\./g, "$1")
        .replace(/(\.\d\d)\d+$/, "$1")
        .replace(/(\d{4})\d+/, "$1");
      if (updated === prevVal) return prev;
      next[index] = updated;
      // Auto-append nếu đang ở cuối và đủ độ dài tối thiểu
      if (updated.length >= 6 && next.length === index + 1) {
        next.push("");
      }
      // Thu gọn đuôi rỗng khi quá ngắn
      if (updated.length < 6) {
        while (next.length > index + 1 && next[next.length - 1].trim() === "") {
          next.pop();
        }
      }
      const nowValid = isAssetValid(updated);
      if (!wasValid && nowValid) {
        scheduleNextFocusIndex = index + 1;
      }
      return next.length > 0 ? next : [""];
    });
    if (scheduleNextFocusIndex !== null) {
      const nextIdx = scheduleNextFocusIndex;
      if (nextIdx >= 5) setShowAllAssets(true);
      setTimeout(() => {
        const el = assetInputRefs.current[nextIdx];
        try { el?.focus(); } catch {}
      }, 0);
    }
  }, [isAssetValid]);

  const addAssetField = useCallback(() => setMultipleAssets((prev) => [...prev, ""]), []);
  const removeAssetField = useCallback((index: number) => setMultipleAssets((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [""])), []);

  const handleRoomChange = useCallback((selectedRoom: string) => {
    setFormData((prev) => ({
      ...prev,
      room: selectedRoom,
      note: selectedRoom === "QLN" ? "" : "Ship PGD",
      parts_day: getDefaultPartsDay(selectedRoom),
    }));
  }, [getDefaultPartsDay]);

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
      if (!validateAssetFormat(asset.trim())) {
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
  }, [multipleAssets, validateAssetFormat, parseAssetCode]);

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
    setMessage({ type: "", text: "" });

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
      };
      if (!requiresNoteDropdown && formData.room !== "QLN") {
        delete payload.note;
      }
      return payload;
    });

    const codesForKey = transactions.map((t) => `${t.asset_code}.${t.asset_year}`).sort().join(",");
    const idemKey = simpleHash(`${currentStaff.username}|${formData.room}|${formData.parts_day}|${txDate}|${codesForKey}`);

    const result = await edgeInvoke<any[]>("asset-transactions", {
      action: "create",
      staff_username: currentStaff.username,
      staff_email: currentStaff.email,
      staff_name: currentStaff.staff_name,
      transactions,
      idempotency_key: idemKey,
    });

    if (!result.ok) {
      setIsLoading(false);
      const msg = friendlyErrorMessage(result.error);
      toast.error(msg);
      setMessage({ type: "error", text: msg });
      return;
    }

    const created: any[] = result.data || [];
    const codesList = created.map((t: any) => `${t.asset_code}.${t.asset_year}`);
    const firstFew = codesList.slice(0, 5).join(", ");
    const moreCount = codesList.length > 5 ? `, ... (+${codesList.length - 5})` : "";

    setMessage({
      type: "success",
      text: `✅ Đã lưu ${created.length} tài sản cho ${formData.room} (${formData.parts_day} - ${txDate}). Mã TS: ${firstFew}${moreCount}.`,
    });
    toast.success("Đã gửi thông báo trong ứng dụng");

    setFormData(currentStaff ? calculateDefaultValues(currentStaff) : formData);
    setMultipleAssets([""]);
    setIsLoading(false);

    try {
      window.dispatchEvent(new Event("asset:submitted"));
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch {}
  }, [isRestrictedTime, currentStaff, formData, multipleAssets, requiresNoteDropdown, getYmd, parseAssetCode, calculateDefaultValues, validateAllAssets]);

  const compressImageToDataUrl = (file: File, maxDim = 1600, quality = 0.75): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(String(reader.result));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          try {
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            resolve(dataUrl);
          } catch {
            resolve(String(reader.result));
          }
        };
        img.onerror = () => resolve(String(reader.result));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error("Không đọc được file"));
      reader.readAsDataURL(file);
    });

  const addPendingFiles = useCallback((files: File[]) => {
    if (!files || files.length === 0) return;
    setPendingImages((prev) => {
      const room = AI_MAX_IMAGES - prev.length;
      if (room <= 0) {
        toast.error(`Tối đa ${AI_MAX_IMAGES} ảnh cho một lần nhập.`);
        return prev;
      }
      const toAdd = files.slice(0, room);
      const ignored = files.length - toAdd.length;
      if (ignored > 0) {
        toast.warning(`Đã đạt tối đa ${AI_MAX_IMAGES} ảnh. Bỏ qua ${ignored} ảnh.`);
      }
      return [...prev, ...toAdd];
    });
  }, []);

  const processImages = useCallback(async (files: File[]) => {
    setIsProcessingImage(true);
    setAiStatus({ stage: "starting", progress: 0, total: files.length, detail: "Đang chuẩn bị xử lý hình ảnh..." });
    setMessage({ type: "", text: "" });
    try {
      const images: string[] = [];
      let index = 0;
      for (const file of files) {
        index += 1;
        setAiStatus({ stage: "uploading", progress: index - 1, total: files.length, detail: `Đang tối ưu ảnh ${index}/${files.length}...` });
        const dataUrl = await compressImageToDataUrl(file, 1600, 0.75);
        images.push(dataUrl);
        setAiStatus({ stage: "progress", progress: index, total: files.length, detail: `Đã nạp ${index}/${files.length} ảnh` });
      }

      setAiStatus({ stage: "extracting", progress: 0, total: files.length, detail: "Đang phân tích bằng AI..." });
      const { data, error } = await edgeInvoke<any>("ai-extract-asset-codes", {
        images,
        rate_limit_key: currentStaff?.username || "anon",
      });

      if (!data && error) {
        setAiStatus({ stage: "error", progress: 0, total: files.length, detail: "AI lỗi khi phân tích hình ảnh." });
        setMessage({ type: "error", text: friendlyErrorMessage(error) });
        return;
      }

      const payload: any = (data && (data as any).data) ? (data as any).data : data;
      const meta = payload?.meta || {};
      const abVariant = meta?.ab_variant || "";
      const modelName = meta?.model || "";
      const aiCodes: string[] = Array.isArray(payload?.codes) ? payload.codes : [];

      if (!aiCodes.length) {
        setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: "Không tìm thấy mã tài sản hợp lệ." });
        setMessage({ type: "error", text: "Không tìm thấy mã tài sản hợp lệ trong hình ảnh." });
        return;
      }

      const uniqueCodes = Array.from(new Set(aiCodes)).filter((formatted) => isAssetValid(formatted));
      if (!uniqueCodes.length) {
        setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: "Không tìm thấy mã hợp lệ theo định dạng." });
        setMessage({ type: "error", text: "Không tìm thấy mã hợp lệ theo định dạng X.YY." });
        return;
      }

      setMultipleAssets((prev) => {
        const existing = prev.filter((a) => a.trim());
        const merged = Array.from(new Set([...existing, ...uniqueCodes]));
        return merged.length > 0 ? merged : [""];
      });

      const needsCodes: string[] = Array.isArray(payload?.needs_confirmation?.codes) ? payload.needs_confirmation.codes : [];
      const needsOptions: Record<string, string[]> = payload?.needs_confirmation?.options || {};
      const initialSelections: Record<string, string> = {};
      needsCodes.forEach((c) => {
        const opts = needsOptions[c] || [];
        if (opts.length > 0) initialSelections[c] = opts[0];
      });
      if (needsCodes.length > 0) {
        setAiNeedsConfirm({ options: needsOptions, selections: initialSelections });
        setIsAiConfirmOpen(true);
        setMessage({ type: "success", text: `Đã điền ${uniqueCodes.length} mã; có ${needsCodes.length} mã cần xác nhận (${needsCodes.join(", ")}).` });
      } else {
        setMessage({ type: "success", text: `Đã điền ${uniqueCodes.length} mã tài sản.` });
      }

      setIsImageDialogOpen(false);
      const modelInfo = modelName ? ` • Model: ${modelName}${abVariant ? ` (${abVariant})` : ""}` : "";
      setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: `Đã điền ${uniqueCodes.length} mã tài sản.${modelInfo}` });
    } catch {
      setAiStatus({ stage: "error", progress: 0, total: 0, detail: "Có lỗi xảy ra khi xử lý hình ảnh." });
      setMessage({ type: "error", text: "Có lỗi xảy ra khi xử lý hình ảnh!" });
    } finally {
      setIsProcessingImage(false);
      setTimeout(() => setAiStatus({ stage: "", progress: 0, total: 0, detail: "" }), 1200);
    }
  }, [isAssetValid, currentStaff]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      addPendingFiles(files);
      toast.success(`Đã thêm ${Math.min(files.length, AI_MAX_IMAGES)} ảnh vào danh sách.`);
    }
    event.target.value = "";
  }, [addPendingFiles]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const navAny = navigator as any;
      if (!navAny.clipboard || typeof navAny.clipboard.read !== "function") {
        toast.error("Trình duyệt không hỗ trợ dán ảnh từ clipboard.");
        return;
      }
      const items: any[] = await navAny.clipboard.read();
      const images: File[] = [];
      let idx = 0;
      for (const item of items) {
        for (const type of item.types || []) {
          if (String(type).startsWith("image/")) {
            const blob: Blob = await item.getType(type);
            const fname = `clipboard-${Date.now()}-${idx++}.${type.includes("png") ? "png" : (type.includes("webp") ? "webp" : "jpg")}`;
            images.push(new File([blob], fname, { type: blob.type }));
          }
        }
      }
      if (images.length === 0) {
        toast.error("Không tìm thấy ảnh trong clipboard.");
        return;
      }
      addPendingFiles(images);
      toast.success(`Đã dán ${images.length} ảnh từ clipboard.`);
    } catch {
      toast.error("Không thể đọc ảnh từ clipboard. Hãy cho phép quyền hoặc thử lại.");
    }
  }, [addPendingFiles]);

  const handleProcessPending = useCallback(async () => {
    if (pendingImages.length === 0) {
      toast.error("Chưa có ảnh nào trong danh sách.");
      return;
    }
    await processImages(pendingImages);
    setPendingImages([]);
  }, [pendingImages, processImages]);

  return (
    <div className="w-full">
      <div className="mx-auto max-w-4xl p-4 space-y-4">
        <div className="rounded-lg bg-card border p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-green-600 to-green-700 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Thông báo lấy TS</h1>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowOptions((v) => !v)} className="ml-2">
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

          <form onSubmit={(e) => { e.preventDefault(); handleOpenConfirm(); }} className="mt-6 space-y-6">
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
                <CalendarIcon className="text-muted-foreground" size={18} /> Khác tuần mới chọn ngày
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="session-sang-inline"
                      checked={formData.parts_day === "Sáng"}
                      onCheckedChange={(v: CheckedState) =>
                        setFormData((p) => ({ ...p, parts_day: v ? "Sáng" : (p.parts_day === "Sáng" ? "" : p.parts_day) }))
                      }
                    />
                    <Label htmlFor="session-sang-inline" className="text-sm">Sáng</Label>
                  </div>
                </div>
                <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="session-chieu-inline"
                      checked={formData.parts_day === "Chiều"}
                      onCheckedChange={(v: CheckedState) =>
                        setFormData((p) => ({ ...p, parts_day: v ? "Chiều" : (p.parts_day === "Chiều" ? "" : p.parts_day) }))
                      }
                    />
                    <Label htmlFor="session-chieu-inline" className="text-sm">Chiều</Label>
                  </div>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 w-full justify-center">
                      {formatDateShort(formData.transaction_date)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.transaction_date || undefined}
                      onSelect={(date) => date && setFormData((p) => ({ ...p, transaction_date: date }))}
                      disabled={(date) => !!date && date < minDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="type-khac-inline"
                      checked={formData.transaction_type === "Khác"}
                      onCheckedChange={(v: CheckedState) => v && setFormData((p) => ({ ...p, transaction_type: "Khác" }))}
                    />
                    <Label htmlFor="type-khac-inline" className="text-sm">Khác</Label>
                  </div>
                </div>
                <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="type-xuat-inline"
                      checked={formData.transaction_type === "Xuất"}
                      onCheckedChange={(v: CheckedState) => setFormData((p) => ({ ...p, transaction_type: v ? "Xuất" : "Khác" }))}
                    />
                    <Label htmlFor="type-xuat-inline" className="text-sm">Xuất</Label>
                  </div>
                </div>
                <div className="flex items-center justify-center h-10 px-2 border rounded-md">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="type-muon-inline"
                      checked={formData.transaction_type === "Mượn"}
                      onCheckedChange={(v: CheckedState) => setFormData((p) => ({ ...p, transaction_type: v ? "Mượn" : "Khác" }))}
                    />
                    <Label htmlFor="type-muon-inline" className="text-sm">Mượn</Label>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Nhập [Mã TS] . [Năm TS]:  (nhiều TS chọn nút AI nhập bằng hình)</Label>
                  <Dialog open={isImageDialogOpen} onOpenChange={(v) => { setIsImageDialogOpen(v); if (!v) setPendingImages([]); }}>
                    <Button type="button" variant="ghost" className="text-green-600 hover:text-green-700 flex items-center gap-1" onClick={() => setIsImageDialogOpen(true)}>
                      <Camera className="w-5 h-5" />
                      <span className="text-sm font-semibold">AI</span>
                    </Button>
                    <DialogContent className="max-w-md">
                      <DialogHeader><DialogTitle>Chọn cách nhập hình ảnh</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-2">
                          <Button onClick={() => document.getElementById("file-input-inline")?.click()} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                            <Upload className="w-5 h-5" /> Upload từ thiết bị
                          </Button>
                          <Button onClick={() => document.getElementById("camera-input-inline")?.click()} className="w-full h-12 bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                            <Camera className="w-5 h-5" /> Chụp ảnh
                          </Button>
                          <Button onClick={handlePasteFromClipboard} className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                            <Upload className="w-5 h-5" /> Dán ảnh từ clipboard
                          </Button>
                        </div>

                        {(pendingImages.length > 0) && (
                          <div className="p-3 rounded-md border bg-slate-50 text-sm">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium">Đã chọn {pendingImages.length}/{AI_MAX_IMAGES} ảnh</div>
                              <Button type="button" variant="outline" size="sm" onClick={() => setPendingImages([])} disabled={isProcessingImage}>Xóa danh sách</Button>
                            </div>
                            <div className="max-h-40 overflow-auto space-y-1">
                              {pendingImages.map((f, i) => (
                                <div key={i} className="truncate">{f.name || `Ảnh ${i + 1}`}</div>
                              ))}
                            </div>
                            <div className="mt-3 flex gap-2">
                              <Button onClick={handleProcessPending} className="flex-1 bg-green-600 hover:bg-green-700" disabled={isProcessingImage || pendingImages.length === 0}>Nhập dữ liệu</Button>
                              <Button type="button" variant="outline" className="flex-1" onClick={() => setPendingImages([])} disabled={isProcessingImage}>Hủy</Button>
                            </div>
                          </div>
                        )}

                        {(isProcessingImage || aiStatus.stage) && (
                          <div className="p-3 rounded-md border bg-slate-50 text-sm flex items-start gap-3">
                            <Loader2 className={`w-4 h-4 mt-0.5 ${isProcessingImage ? "animate-spin" : ""}`} />
                            <div>
                              <div className="font-medium">{aiStatus.detail || "Đang xử lý..."}</div>
                              {aiStatus.total > 0 && (
                                <div className="mt-2 h-2 bg-slate-200 rounded">
                                  <div className="h-2 bg-green-600 rounded" style={{ width: `${Math.min(100, Math.round((aiStatus.progress / Math.max(aiStatus.total, 1)) * 100))}%` }}></div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {(showAllAssets ? multipleAssets : multipleAssets.slice(0, 5)).map((val, idx) => {
                  const valid = isAssetValid(val);
                  const visibleCount = showAllAssets ? multipleAssets.length : Math.min(multipleAssets.length, 5);
                  const isLast = idx === visibleCount - 1;
                  return (
                    <AssetCodeInputRow
                      key={idx}
                      index={idx}
                      value={val}
                      isValid={valid}
                      onChange={(i, v) => handleAssetChange(i, v)}
                      onAddRow={addAssetField}
                      onRemoveRow={removeAssetField}
                      inputRef={(el) => { assetInputRefs.current[idx] = el; }}
                      autoFocus={idx === 0}
                      // Hiển thị Next nếu còn dòng phía sau (kể cả dòng ẩn)
                      enterKeyHint={idx < multipleAssets.length - 1 ? "next" : "done"}
                      isLast={isLast}
                      onPasteText={handlePasteText}
                      onTabNavigate={(i, dir) => {
                        if (dir === "next") {
                          const next = i + 1;
                          if (next >= multipleAssets.length) {
                            setMultipleAssets((prev) => [...prev, ""]);
                            setTimeout(() => assetInputRefs.current[next]?.focus(), 0);
                          } else {
                            // Nếu đang ở cuối phần hiển thị và còn dòng ẩn → tự mở rộng để thấy dòng kế tiếp
                            const visibleNow = showAllAssets ? multipleAssets.length : Math.min(multipleAssets.length, 5);
                            if (!showAllAssets && next >= visibleNow) {
                              setShowAllAssets(true);
                              setTimeout(() => assetInputRefs.current[next]?.focus(), 0);
                            } else {
                              assetInputRefs.current[next]?.focus();
                            }
                          }
                        } else {
                          const prevIdx = i - 1;
                          if (prevIdx >= 0) assetInputRefs.current[prevIdx]?.focus();
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
              <Button
                type="button"
                onClick={() => { setFormData(currentStaff ? calculateDefaultValues(currentStaff) : formData); setMultipleAssets([""]); setMessage({ type: "", text: "" }); }}
                variant="outline"
              >
                Clear
              </Button>
              <Button
                type="submit"
                disabled={!isFormValid || isLoading || (isRestrictedTime && currentStaff?.role !== "admin")}
                className="h-10 px-4 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isLoading ? "Đang gửi..." : "Gửi thông báo"}
              </Button>
            </div>

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

            <Dialog open={isAiConfirmOpen} onOpenChange={setIsAiConfirmOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Xác nhận mã cần làm rõ</DialogTitle>
                </DialogHeader>
                {aiNeedsConfirm && Object.keys(aiNeedsConfirm.options).length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Một số mã có nhiều cách diễn giải năm. Vui lòng chọn chính xác cho từng mã:</p>
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
                                {opts.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
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

            <input id="file-input-inline" type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
            <input id="camera-input-inline" type="file" accept="image/*" multiple capture="environment" onChange={handleFileUpload} className="hidden" />
          </form>
        </div>
      </div>
    </div>
  );
};

export default AssetEntryInlineForm;