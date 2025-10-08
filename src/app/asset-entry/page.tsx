"use client";

import React, { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";
import { 
  Package, Building2 as Building, Camera, Upload, CheckCircle, AlertCircle, 
  Plus, Minus, ChevronDown, ChevronUp, CalendarDays as CalendarIcon, RefreshCcw, Edit3, Trash2, Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";

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
  transaction_date: string; // yyyy-MM-dd
  parts_day: "Sáng" | "Chiều";
  note: string | null;
  staff_code: string;
  notified_at: string;
  is_deleted: boolean;
  created_date: string;
  updated_date: string;
};

const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"] as const;
const OPS = ["Xuất kho", "Mượn TS", "Thay bìa"] as const;
const SESSIONS = ["Sáng", "Chiều"] as const;

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

const FUNCTION_URL = `${SUPABASE_PUBLIC_URL}/functions/v1/asset-transactions`;

async function callAssetFunc(body: Record<string, any>) {
  // 1) Invoke via supabase client
  try {
    const { data, error } = await supabase.functions.invoke("asset-transactions", { body });
    if (!error) return { ok: true, data };
  } catch {
    // ignore
  }
  // 2) Fallback direct fetch
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLIC_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json) return { ok: true, data: json.data };
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to fetch" };
  }
}

export default function AssetEntryPage() {
  const router = useRouter();

  const [currentStaff, setCurrentStaff] = useState<SafeStaff | null>(null);

  const [formData, setFormData] = useState<{
    transaction_date: Date | null;
    parts_day: "" | "Sáng" | "Chiều";
    room: string;
    transaction_type: "" | "Xuất kho" | "Mượn TS" | "Thay bìa";
    note: string;
  }>({
    transaction_date: null,
    parts_day: "",
    room: "",
    transaction_type: "",
    note: "Ship PGD",
  });

  const [multipleAssets, setMultipleAssets] = useState<string[]>([""]);
  const [message, setMessage] = useState<{ type: "" | "success" | "error"; text: string }>({ type: "", text: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [isRestrictedTime, setIsRestrictedTime] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ stage: string; progress: number; total: number; detail: string }>({ stage: "", progress: 0, total: 0, detail: "" });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);

  const [myRows, setMyRows] = useState<AssetTx[]>([]);
  const [listOpen, setListOpen] = useState<boolean>(false);

  // Defaults per spec
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
    transaction_type: "" | "Xuất kho" | "Mượn TS" | "Thay bìa";
    note: string;
  } => {
    const now = new Date();
    const gmt7Hour = (now.getUTCHours() + 7) % 24;
    const dow = now.getDay();
    let defaultDate = new Date(now);

    // Sau 13:00 thứ 6, hoặc T7/CN => thứ 2 kế tiếp; sau 13:00 ngày thường => ngày mai; trước 8:00 => hôm nay
    if ((dow === 5 && gmt7Hour >= 13) || dow === 6 || dow === 0) {
      const daysUntilMonday = ((8 - dow) % 7) || 7;
      defaultDate = new Date(now.getTime() + (daysUntilMonday === 7 ? 1 : daysUntilMonday) * 24 * 60 * 60 * 1000);
    } else if (gmt7Hour >= 13) {
      defaultDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else {
      defaultDate = now;
    }

    const department = staff.department || "";
    const defaultRoom = ROOMS.includes(department as any) ? String(department) : "";

    return {
      transaction_date: defaultDate,
      parts_day: getDefaultPartsDay(defaultRoom),
      room: defaultRoom,
      transaction_type: "",
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
  }, [router, calculateDefaultValues]);

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

  // Validation
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

  const handleAssetChange = useCallback((index: number, value: string) => {
    const newAssets = [...multipleAssets];
    const normalized = String(value).replace(/,/g, ".");
    newAssets[index] = normalized
      .replace(/[^0-9.]/g, "")
      .replace(/(\..*)\./g, "$1")
      .replace(/(\.\d\d)\d+$/, "$1")
      .replace(/(\d{4})\d+/, "$1");
    setMultipleAssets(newAssets);
  }, [multipleAssets]);

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
      if (!validateAssetFormat(asset)) {
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

  const performSubmit = useCallback(async () => {
    setIsConfirmOpen(false);
    if (isRestrictedTime && currentStaff?.role !== "admin") {
      setMessage({ type: "error", text: "Không thể lưu dữ liệu trong giờ nghỉ. Vui lòng nhắn Zalo!" });
      return;
    }
    if (!validateAllAssets() || !currentStaff || !formData.transaction_date) return;

    setIsLoading(true);
    setMessage({ type: "", text: "" });

    const notifiedAt = getUtcNowIso();
    const txDate = getYmd(formData.transaction_date);

    const filledAssets = multipleAssets.filter((a) => a.trim());
    const transactions = filledAssets.map((asset) => {
      const parsed = parseAssetCode(asset)!;
      const payload: any = {
        transaction_date: txDate,
        parts_day: formData.parts_day,
        room: formData.room,
        transaction_type: formData.transaction_type,
        asset_year: parsed.asset_year,
        asset_code: parsed.asset_code,
        note: formData.note || null,
        notified_at: notifiedAt,
      };
      if (!requiresNoteDropdown && formData.room !== "QLN") {
        delete payload.note;
      }
      return payload;
    });

    const result = await callAssetFunc({
      action: "create",
      staff_username: currentStaff.username,
      staff_email: currentStaff.email,
      staff_name: currentStaff.staff_name,
      transactions,
    });

    if (!result.ok) {
      setIsLoading(false);
      toast.error(typeof result.error === "string" ? result.error : "Không thể gửi dữ liệu.");
      setMessage({ type: "error", text: "Có lỗi khi lưu dữ liệu! Vui lòng thử lại." });
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

    // Reset form mặc định cho lần nhập tiếp
    setFormData(calculateDefaultValues(currentStaff));
    setMultipleAssets([""]);
    setIsLoading(false);

    // Làm mới danh sách hôm nay
    fetchMyToday();
  }, [isRestrictedTime, currentStaff, formData, multipleAssets, requiresNoteDropdown, getUtcNowIso, getYmd, parseAssetCode, calculateDefaultValues]);

  // AI image process (UI có sẵn; phần OCR sẽ bổ sung sau)
  const processImages = useCallback(async (files: File[]) => {
    setIsProcessingImage(true);
    setAiStatus({ stage: "starting", progress: 0, total: files.length, detail: "Đang chuẩn bị xử lý hình ảnh..." });
    // Chưa tích hợp OCR/Upload, hiển thị thông báo hướng dẫn
    setTimeout(() => {
      setAiStatus({ stage: "error", progress: 0, total: files.length, detail: "Chưa tích hợp AI đọc mã từ ảnh." });
      setIsProcessingImage(false);
      toast.error("Chức năng AI sẽ được bổ sung sau.");
    }, 600);
  }, []);
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) processImages(files);
    event.target.value = "";
  }, [processImages]);

  // Load my today submissions (GMT+7)
  const fetchMyToday = useCallback(async () => {
    const staff = currentStaff;
    if (!staff) return;
    const res = await callAssetFunc({ action: "list_mine_today", staff_username: staff.username });
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Không thể tải danh sách hôm nay");
      return;
    }
    setMyRows((res.data as AssetTx[]) || []);
  }, [currentStaff]);

  useEffect(() => {
    if (currentStaff) {
      // mặc định đóng; chỉ tải khi mở
      if (listOpen) fetchMyToday();
    }
  }, [currentStaff, listOpen, fetchMyToday]);

  const updateNote = useCallback(async (row: AssetTx) => {
    const newNote = prompt("Nhập ghi chú mới", row.note ?? "") ?? null;
    if (newNote === null) return;
    const res = await callAssetFunc({
      action: "update_note",
      id: row.id,
      note: newNote,
      editor_username: currentStaff?.username || "",
    });
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Không thể cập nhật ghi chú");
      return;
    }
    toast.success("Đã cập nhật ghi chú");
    setMyRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, note: newNote } : x)));
  }, [currentStaff]);

  const removeTransaction = useCallback(async (id: string) => {
    const res = await callAssetFunc({
      action: "soft_delete",
      id,
      deleted_by: currentStaff?.username || "",
    });
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Không thể xóa");
      return;
    }
    toast.success("Đã xóa (mềm)");
    setMyRows((prev) => prev.filter((r) => r.id !== id));
  }, [currentStaff]);

  return (
    <div className="w-full">
      <SonnerToaster />
      <div className="mx-auto max-w-4xl p-4 space-y-4">
        <div className="rounded-lg bg-card border p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-green-600 to-green-700 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Thông báo Mượn/Xuất</h1>
              <p className="text-muted-foreground mt-1">
                {currentStaff?.role === "admin"
                  ? "Không giới hạn thời gian cho Admin"
                  : "Khung giờ 7:45-8:05 và 12:45-13:05 hãy nhắn Zalo vì đã chốt DS"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-md bg-green-50 text-green-700 p-3 text-sm" id="instruction-section">
            Từ Phải sang Trái: 2 ký tự thứ 9 và 10 là Năm TS: 24; 4 ký tự cuối là Mã TS: 259 - vd: 0424102470200259
          </div>

          <form onSubmit={handleOpenConfirm} className="mt-6 space-y-6">
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Nhập [Mã TS] . [Năm TS]: Có dấu <span className="font-bold text-red-600">CHẤM (hoặc PHẨY)</span> ở giữa.
                </Label>
                <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="ghost" className="text-green-600 hover:text-green-700 flex items-center gap-1">
                      <Camera className="w-5 h-5" />
                      <span className="text-sm font-semibold">AI</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Chọn cách nhập hình ảnh</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <Button onClick={() => document.getElementById("file-input")?.click()} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                        <Upload className="w-5 h-5" /> {isProcessingImage ? "Đang xử lý..." : "Upload từ thiết bị"}
                      </Button>
                      <Button onClick={() => document.getElementById("camera-input")?.click()} className="w-full h-12 bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                        <Camera className="w-5 h-5" /> Chụp ảnh
                      </Button>
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
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        lang="en-US"
                        pattern="[0-9.,]*"
                        autoComplete="off"
                        autoCorrect="off"
                        value={val}
                        onChange={(e) => handleAssetChange(idx, e.target.value)}
                        placeholder="Ví dụ: 259.24"
                        className={`h-10 pr-9 font-mono text-center ${val ? (valid ? "border-green-300" : "border-red-300") : ""}`}
                      />
                      {val && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          {valid ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
                        </div>
                      )}
                    </div>
                    <Button type="button" onClick={addAssetField} variant="outline" size="icon" className="h-9 w-9 rounded-full border-2 border-green-600 text-green-800 hover:bg-green-100" aria-label="Thêm dòng">
                      <Plus className="w-4 h-4" />
                    </Button>
                    {multipleAssets.length > 1 && (
                      <Button type="button" onClick={() => removeAssetField(idx)} variant="outline" size="icon" className="h-9 w-9 rounded-full border-2 border-red-500 text-red-500 hover:bg-red-100" aria-label="Xóa dòng">
                        <Minus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
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

            <div className="space-y-3">
              <Label className="text-sm font-medium">Loại tác nghiệp Xuất/Mượn/Thay bìa</Label>
              <Select value={formData.transaction_type} onValueChange={(v) => setFormData((p) => ({ ...p, transaction_type: v as any }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Chọn Mượn/Xuất TS/Thay bìa" /></SelectTrigger>
                <SelectContent>
                  {OPS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <CalendarIcon className="text-muted-foreground" size={18} /> Buổi và ngày lấy TS
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select value={formData.parts_day} onValueChange={(v) => setFormData((p) => ({ ...p, parts_day: v as any }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Chọn buổi" /></SelectTrigger>
                  <SelectContent>
                    {SESSIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.transaction_date ? new Date(formData.transaction_date).toLocaleDateString("vi-VN") : <span>Chọn ngày</span>}
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

            <div className="hidden md:flex items-center justify-end gap-2 pt-2">
              <Button type="button" onClick={() => { setFormData(currentStaff ? calculateDefaultValues(currentStaff) : formData); setMultipleAssets([""]); setMessage({ type: "", text: "" }); }} variant="outline">
                Clear
              </Button>
              <Button type="submit" disabled={!isFormValid || isLoading || (isRestrictedTime && currentStaff?.role !== "admin")} className="h-10 px-4 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                {isLoading ? "Đang gửi..." : "Gửi thông báo"}
              </Button>
            </div>

            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Xác nhận gửi thông báo</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div><span className="font-medium">Phòng:</span> {formData.room}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="font-medium">Buổi:</span> {formData.parts_day}</div>
                    <div><span className="font-medium">Ngày:</span> {formData.transaction_date ? new Date(formData.transaction_date).toLocaleDateString("vi-VN") : "-"}</div>
                    <div><span className="font-medium">Loại:</span> {formData.transaction_type || "-"}</div>
                    <div><span className="font-medium">Ghi chú:</span> {formData.note || "-"}</div>
                  </div>
                  <div>
                    <span className="font-semibold">Danh sách mã TS ({multipleAssets.filter((a) => a.trim()).length}):</span>
                    <div className="mt-2 max-h-40 overflow-auto rounded border bg-slate-50 p-3">
                      {multipleAssets.filter((a) => a.trim()).map((a, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-base">
                          {isAssetValid(a) ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                          <span className={`${isAssetValid(a) ? "text-slate-800" : "text-red-600"}`}>{a}</span>
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
          </form>
        </div>

        <input id="file-input" type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
        <input id="camera-input" type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />

        {/* Mobile sticky actions */}
        {(!isRestrictedTime || currentStaff?.role === "admin") ? (
          <div className="md:hidden fixed bottom-4 left-0 right-0 z-40 px-4">
            <div className="bg-white/95 backdrop-blur shadow-lg rounded-xl p-3 flex items-center gap-2 border">
              <Button type="button" onClick={() => { setFormData(currentStaff ? calculateDefaultValues(currentStaff) : formData); setMultipleAssets([""]); setMessage({ type: "", text: "" }); }} variant="outline" className="flex-1">Clear</Button>
              <Button onClick={() => handleOpenConfirm()} disabled={!isFormValid || isLoading} className="flex-1 bg-green-600 text-white hover:bg-green-700">
                {isLoading ? "Đang gửi..." : "Gửi thông báo"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="md:hidden fixed bottom-4 left-0 right-0 z-40 px-4">
            <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded-xl p-3 text-center">
              Khung giờ nghỉ • Vui lòng nhắn Zalo
            </div>
          </div>
        )}

        {/* Đã gửi hôm nay */}
        <div className="rounded-lg bg-card border p-6 shadow-sm">
          <button className="w-full flex items-center justify-between text-left" onClick={() => setListOpen((o) => !o)}>
            <span className="font-semibold">Thông báo đã gửi hôm nay</span>
            <span className="text-muted-foreground">{listOpen ? "Thu gọn" : "Mở"}</span>
          </button>

          {listOpen && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  Hiển thị các giao dịch bạn đã tạo trong ngày (GMT+7) và chưa xóa.
                </p>
                <Button onClick={fetchMyToday} variant="outline" className="h-9">
                  <RefreshCcw className="w-4 h-4 mr-2" /> Làm mới
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 px-3">Phòng</th>
                      <th className="py-2 px-3">Năm TS</th>
                      <th className="py-2 px-3">Mã TS</th>
                      <th className="py-2 px-3">Loại</th>
                      <th className="py-2 px-3">Ngày</th>
                      <th className="py-2 px-3">Buổi</th>
                      <th className="py-2 px-3">Ghi chú</th>
                      <th className="py-2 px-3">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRows.length === 0 ? (
                      <tr>
                        <td className="py-3 px-3 text-muted-foreground" colSpan={8}>Chưa có giao dịch nào hôm nay.</td>
                      </tr>
                    ) : (
                      myRows.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="py-2 px-3">{r.room}</td>
                          <td className="py-2 px-3">{r.asset_year}</td>
                          <td className="py-2 px-3">{r.asset_code}</td>
                          <td className="py-2 px-3">{r.transaction_type}</td>
                          <td className="py-2 px-3">{r.transaction_date}</td>
                          <td className="py-2 px-3">{r.parts_day}</td>
                          <td className="py-2 px-3">{r.note ?? ""}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <button
                                title="Sửa (ghi chú)"
                                className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-muted"
                                onClick={() => updateNote(r)}
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                title="Xóa (mềm)"
                                className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-muted"
                                onClick={() => removeTransaction(r.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}