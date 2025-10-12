"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCheck, Send, Trash2, Plus, CheckCircle, AlertCircle, Edit, Trash, Eye, Loader2, Filter } from "lucide-react";
import { format } from "date-fns";
import AutoCompleteInput from "@/components/reminders/AutoCompleteInput";
import DateInput from "@/components/reminders/DateInput";
import CRCTemplateDialog, { DEFAULT_TEMPLATE_CRC, renderCRCTemplate } from "@/components/reminders/CRCTemplateDialog";
import { LDPCRCStaffAPI, LDPCRCStaffItem } from "@/entities/LDPCRCStaff";
import { CBCRCStaffAPI, CBCRCStaffItem } from "@/entities/CBCRCStaff";
import { QUYCRCStaffAPI, QUYCRCStaffItem } from "@/entities/QUYCRCStaff";
import { CRCReminder, CRCReminderAPI } from "@/entities/CRCReminder";
import { SentCRCReminder, SentCRCReminderAPI } from "@/entities/SentCRCReminder";
import { fetchWithCache, cacheManager } from "@/lib/cache";
import { SonnerToaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Staff = { username?: string; staff_name?: string; role?: string; department?: string };

export default function CRCRemindersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Staff | null>(null);
  const [reminders, setReminders] = useState<CRCReminder[]>([]);
  const [sentReminders, setSentReminders] = useState<SentCRCReminder[]>([]);
  const [ldpcrcStaff, setLdpcrcStaff] = useState<LDPCRCStaffItem[]>([]);
  const [cbcrcStaff, setCbcrcStaff] = useState<CBCRCStaffItem[]>([]);
  const [quycrcStaff, setQuycrcStaff] = useState<QUYCRCStaffItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "" | "success" | "error"; text: string }>({ type: "", text: "" });

  const [templateOpen, setTemplateOpen] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<string>(() => {
    try { return localStorage.getItem("crc_reminder_email_template") || DEFAULT_TEMPLATE_CRC; } catch { return DEFAULT_TEMPLATE_CRC; }
  });
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ id: string; loai_bt_crc: string; status: "pending" | "sending" | "success" | "error"; message?: string }[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [isBgRefreshing, setIsBgRefreshing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [editingReminder, setEditingReminder] = useState<CRCReminder | null>(null);
  const [editingSentReminder, setEditingSentReminder] = useState<SentCRCReminder | null>(null);

  const [newReminder, setNewReminder] = useState<Partial<CRCReminder>>({
    loai_bt_crc: "",
    ngay_thuc_hien: format(new Date(), "dd-MM"),
    ldpcrc: "",
    cbcrc: "",
    quycrc: "",
  });

  // Refs for tab navigation
  const loaiCRCRef = useRef<HTMLDivElement | null>(null);
  const ngayThucHienRef = useRef<HTMLDivElement | null>(null);
  const ldpcrcRef = useRef<HTMLDivElement | null>(null);
  const cbcrcRef = useRef<HTMLDivElement | null>(null);
  const quycrcRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try { localStorage.setItem("crc_reminder_email_template", emailTemplate); } catch {}
  }, [emailTemplate]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("loggedInStaff");
      const s = raw ? JSON.parse(raw) as Staff : null;
      if (!s) {
        router.replace("/sign-in");
        return;
      }
      setCurrentUser(s);
    } catch {}
  }, [router]);

  const crcSuggestions = useMemo(() => {
    const base = ["Nhập - ", "Xuất - ", "Mượn - "];
    const names = [...new Set([...(reminders || []).map(r => r.loai_bt_crc || ""), ...(sentReminders || []).map(r => r.loai_bt_crc || "")])].filter(Boolean);
    const extra = names.filter(n => !base.includes(n));
    return [...base, ...extra].sort((a, b) => {
      const ai = base.indexOf(a), bi = base.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
  }, [reminders, sentReminders]);

  // Background refresh
  useEffect(() => {
    let timer: any;
    let destroyed = false;
    const schedule = () => {
      const jitter = Math.floor(Math.random() * 15000);
      const base = 120000;
      timer = setTimeout(tick, base + jitter);
    };
    const tick = async () => {
      if (destroyed) return;
      if (document.visibilityState === "hidden" || isBgRefreshing) { schedule(); return; }
      setIsBgRefreshing(true);
      try {
        const [newRems, newSent] = await Promise.all([
          fetchWithCache("crc_reminders_bg", () => CRCReminderAPI.list(), 120000),
          fetchWithCache("sent_crc_reminders_bg", () => SentCRCReminderAPI.list(), 120000),
        ]);
        const nextRems = Array.isArray(newRems) ? newRems.filter(r => !r.is_sent) : [];
        const nextSent = Array.isArray(newSent) ? newSent : [];

        const changedRems = nextRems.length !== reminders.length || nextRems.some((r, i) => r.id !== reminders[i]?.id || r.updated_date !== reminders[i]?.updated_date);
        const changedSent = nextSent.length !== sentReminders.length || nextSent.some((r, i) => r.id !== sentReminders[i]?.id || (r.updated_date || r.sent_date) !== (sentReminders[i]?.updated_date || sentReminders[i]?.sent_date));
        if (changedRems) setReminders(nextRems);
        if (changedSent) setSentReminders(nextSent);
      } catch {
        // silent
      } finally {
        if (!destroyed) setIsBgRefreshing(false);
        schedule();
      }
    };
    schedule();
    return () => { destroyed = true; if (timer) clearTimeout(timer); };
  }, [reminders, sentReminders, isBgRefreshing]);

  const loadReminders = useCallback(async () => {
    const [waiting, sent] = await Promise.all([
      fetchWithCache("crc_reminders", () => CRCReminderAPI.list()),
      fetchWithCache("sent_crc_reminders", () => SentCRCReminderAPI.list()),
    ]);
    setReminders(Array.isArray(waiting) ? waiting.filter(r => !r.is_sent) : []);
    setSentReminders(Array.isArray(sent) ? sent : []);
  }, []);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    try {
      // Tải trực tiếp 3 bảng staff để tránh cache rỗng làm mất dữ liệu gợi ý
      const [ldp, cb, quy] = await Promise.all([
        LDPCRCStaffAPI.list(),
        CBCRCStaffAPI.list(),
        QUYCRCStaffAPI.list(),
      ]);
      setLdpcrcStaff(Array.isArray(ldp) ? ldp : []);
      setCbcrcStaff(Array.isArray(cb) ? cb : []);
      setQuycrcStaff(Array.isArray(quy) ? quy : []);
      await loadReminders();
    } catch {
      setMessage({ type: "error", text: "Không thể tải dữ liệu." });
    } finally {
      setIsLoading(false);
    }
  }, [loadReminders]);

  useEffect(() => { if (currentUser) loadInitial(); }, [currentUser, loadInitial]);

  const isValidDdMm = useCallback((ddmm: string) => {
    if (!/^\d{2}-\d{2}$/.test(ddmm)) return false;
    const [d, m] = ddmm.split("-").map(Number);
    const maxDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 31;
    return m >= 1 && m <= 12 && d >= 1 && d <= maxDays;
  }, []);

  const handleSave = useCallback(async () => {
    if (!newReminder.loai_bt_crc || !newReminder.ngay_thuc_hien) {
      setMessage({ type: "error", text: "Vui lòng nhập loại BT CRC và ngày thực hiện!" });
      return;
    }
    if (!isValidDdMm(String(newReminder.ngay_thuc_hien))) {
      setMessage({ type: "error", text: "Ngày thực hiện không hợp lệ (định dạng dd-MM)." });
      return;
    }
    try {
      if ((newReminder as any).id) {
        await CRCReminderAPI.update(String((newReminder as any).id), newReminder);
        toast.success("Cập nhật nhắc nhở thành công");
      } else {
        await CRCReminderAPI.create({ ...newReminder, created_by: null });
        toast.success("Thêm vào danh sách chờ thành công");
      }
      setNewReminder({ loai_bt_crc: "", ngay_thuc_hien: format(new Date(), "dd-MM"), ldpcrc: "", cbcrc: "", quycrc: "" });
      cacheManager.delete("crc_reminders");
      await loadReminders();
      setTimeout(() => {
        try {
          const el = loaiCRCRef.current as any;
          if (el?.focus) el.focus();
        } catch {}
      }, 0);
    } catch {
      setMessage({ type: "error", text: "Có lỗi xảy ra khi lưu nhắc nhở!" });
    }
  }, [newReminder, isValidDdMm, loadReminders]);

  const editReminder = useCallback((r: CRCReminder) => {
    setEditingReminder(r);
    setEditingSentReminder(null);
    setNewReminder({
      loai_bt_crc: r.loai_bt_crc,
      ngay_thuc_hien: r.ngay_thuc_hien,
      ldpcrc: r.ldpcrc || "",
      cbcrc: r.cbcrc || "",
      quycrc: r.quycrc || "",
      // giữ id để xác định cập nhật
      id: r.id as any,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingReminder(null);
    setEditingSentReminder(null);
    setNewReminder({ loai_bt_crc: "", ngay_thuc_hien: format(new Date(), "dd-MM"), ldpcrc: "", cbcrc: "", quycrc: "" });
  }, []);

  const clearForm = useCallback(() => {
    cancelEdit();
    setMessage({ type: "", text: "" });
    setShowProgress(false);
  }, [cancelEdit]);

  const sendOne = useCallback(async (r: CRCReminder) => {
    setShowProgress(true);
    setSendProgress((prev) => [{ id: r.id, loai_bt_crc: r.loai_bt_crc, status: "sending" }, ...prev.filter(p => p.id !== r.id)]);
    try {
      await CRCReminderAPI.sendOne(r.id);
      setSendProgress((prev) => prev.map(p => p.id === r.id ? { ...p, status: "success" } : p));
      toast.success("Đã gửi nhắc nhở");
      cacheManager.delete("crc_reminders"); cacheManager.delete("sent_crc_reminders");
      await loadReminders();
    } catch {
      setSendProgress((prev) => prev.map(p => p.id === r.id ? { ...p, status: "error", message: "Gửi thất bại" } : p));
      toast.error("Gửi thất bại");
    }
  }, [loadReminders]);

  const sendToday = useCallback(async () => {
    setIsSending(true); setShowProgress(true);
    try {
      const ddmm = format(new Date(), "dd-MM");
      const items = (reminders || []).filter(r => r.ngay_thuc_hien === ddmm);
      if (items.length === 0) { toast.error("Không có nhắc nhở nào cho hôm nay."); setIsSending(false); return; }
      setSendProgress(items.map(r => ({ id: r.id, loai_bt_crc: r.loai_bt_crc, status: "pending" })));
      await CRCReminderAPI.sendToday();
      toast.success(`Đã gửi ${items.length} nhắc nhở hôm nay`);
      cacheManager.delete("crc_reminders"); cacheManager.delete("sent_crc_reminders");
      await loadReminders();
      setSendProgress(prev => prev.map(p => ({ ...p, status: "success" })));
    } catch {
      toast.error("Có lỗi xảy ra khi gửi hôm nay");
      setSendProgress(prev => prev.map(p => ({ ...p, status: "error" })));
    } finally {
      setIsSending(false);
    }
  }, [reminders, loadReminders]);

  const sendAll = useCallback(async () => {
    setIsSending(true); setShowProgress(true);
    try {
      setSendProgress(reminders.map(r => ({ id: r.id, loai_bt_crc: r.loai_bt_crc, status: "pending" })));
      await CRCReminderAPI.sendAll();
      toast.success(`Đã gửi ${reminders.length} nhắc nhở`);
      cacheManager.delete("crc_reminders"); cacheManager.delete("sent_crc_reminders");
      await loadReminders();
      setSendProgress(prev => prev.map(p => ({ ...p, status: "success" })));
    } catch {
      toast.error("Có lỗi xảy ra khi gửi tất cả");
      setSendProgress(prev => prev.map(p => ({ ...p, status: "error" })));
    } finally {
      setIsSending(false);
    }
  }, [reminders, loadReminders]);

  const deleteReminder = useCallback(async (id: string, isSent?: boolean) => {
    if (currentUser?.role !== "admin") {
      setMessage({ type: "error", text: "Chỉ admin mới có quyền xóa!" });
      return;
    }
    try {
      if (isSent) await SentCRCReminderAPI.delete(id);
      else await CRCReminderAPI.delete(id);
      toast.success("Xóa thành công");
      cacheManager.delete(isSent ? "sent_crc_reminders" : "crc_reminders");
      await loadReminders();
    } catch {
      toast.error("Có lỗi xảy ra khi xóa!");
    }
  }, [currentUser, loadReminders]);

  const deleteAllSent = useCallback(async () => {
    if (currentUser?.role !== "admin") {
      setMessage({ type: "error", text: "Chỉ admin mới có quyền xóa!" });
      return;
    }
    if (!confirm("Bạn có chắc chắn muốn xóa tất cả lịch sử đã gửi?")) return;
    try {
      const ids = sentReminders.map(s => s.id);
      await Promise.all(ids.map(id => SentCRCReminderAPI.delete(id)));
      toast.success("Đã xóa tất cả lịch sử");
      cacheManager.delete("sent_crc_reminders");
      await loadReminders();
    } catch {
      toast.error("Có lỗi xảy ra khi xóa!");
    }
  }, [currentUser, sentReminders, loadReminders]);

  const todayDDMM = format(new Date(), "dd-MM");
  const filteredWaiting = useMemo(() => {
    const list = reminders || [];
    const q = (searchText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return list.filter(r => {
      if (!q) return true;
      const fields = [r.loai_bt_crc, r.ngay_thuc_hien, r.ldpcrc || "", r.cbcrc || "", r.quycrc || ""]
        .map(v => String(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      return fields.some(v => v.includes(q));
    });
  }, [reminders, searchText]);

  // Tính recipients_block theo giá trị đang nhập để preview đúng và đủ người nhận
  const computedRecipientsBlock = useMemo(() => {
    const norm = (t: string) =>
      (t || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d");

    const findByName = <T extends { ten_nv: string; email?: string }>(list: T[], name?: string) => {
      if (!name) return undefined;
      const n = norm(name);
      return list.find(x => norm(x.ten_nv) === n);
    };

    const makeEmail = (rec: { email?: string } | undefined, fallbackName?: string) => {
      const raw = (rec?.email || "").trim();
      if (raw) {
        return raw.includes("@") ? raw : `${raw}@vietcombank.com.vn`;
      }
      return (fallbackName || "").trim();
    };

    const lines: string[] = [];
    const ldp = String(newReminder.ldpcrc || "").trim();
    const cb = String(newReminder.cbcrc || "").trim();
    const quy = String(newReminder.quycrc || "").trim();

    if (ldp) {
      const s = findByName(ldpcrcStaff, ldp);
      const email = makeEmail(s, ldp);
      if (email) lines.push(`Người nhận: ${email}`);
    }
    if (cb) {
      const s = findByName(cbcrcStaff, cb);
      const email = makeEmail(s, cb);
      if (email) lines.push(`Người nhận: ${email}`);
    }
    if (quy) {
      const s = findByName(quycrcStaff, quy);
      const email = makeEmail(s, quy);
      if (email) lines.push(`Người nhận: ${email}`);
    }

    return lines.join("<br/>");
  }, [newReminder.ldpcrc, newReminder.cbcrc, newReminder.quycrc, ldpcrcStaff, cbcrcStaff, quycrcStaff]);

  // Ensure staff lists are loaded on-demand when user opens autocomplete
  const ensureLDPCRCLoaded = useCallback(async () => {
    if (ldpcrcStaff.length > 0) return;
    const l = await LDPCRCStaffAPI.list();
    setLdpcrcStaff(Array.isArray(l) ? l : []);
  }, [ldpcrcStaff.length]);

  const ensureCBCRCLoaded = useCallback(async () => {
    if (cbcrcStaff.length > 0) return;
    const l = await CBCRCStaffAPI.list();
    setCbcrcStaff(Array.isArray(l) ? l : []);
  }, [cbcrcStaff.length]);

  const ensureQUYCRCLoaded = useCallback(async () => {
    if (quycrcStaff.length > 0) return;
    const l = await QUYCRCStaffAPI.list();
    setQuycrcStaff(Array.isArray(l) ? l : []);
  }, [quycrcStaff.length]);

  return (
    <div className="p-4 md:p-8">
      <SonnerToaster />
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl flex items-center justify-center">
            <FileCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Nhắc duyệt CRC</h1>
            <p className="text-slate-600">Quản lý và gửi nhắc nhở duyệt chứng từ CRC</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Chờ gửi</div>
            <div className="text-xl font-bold">{reminders.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="text-xs text-slate-500">Đã gửi</div>
            <div className="text-xl font-bold">{sentReminders.length}</div>
          </CardContent>
        </Card>
      </div>

      {message.text && (
        <Alert className={`mb-6 ${message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          {message.type === "success" ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
          <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-600 flex-grow">
          <Filter className="w-4 h-4 mr-1 text-slate-500" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm theo loại, ngày, người liên quan..."
            className="h-9 w-64 md:w-80"
          />
          {isBgRefreshing && <span className="flex items-center gap-1 text-xs text-slate-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> làm mới</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTemplateOpen(true)} className="flex-shrink-0">
            <Eye className="w-4 h-4 mr-2" />
            Chỉnh mẫu email
          </Button>
          <Button
            onClick={sendToday}
            className="bg-green-600 hover:bg-green-700 flex-shrink-0"
            disabled={isSending}
          >
            <Send className="w-4 h-4 mr-2" />
            Gửi Hôm Nay
          </Button>
          <Button onClick={sendAll} disabled={isSending} className="bg-green-600 hover:bg-green-700 flex-shrink-0">
            <Send className="w-4 h-4 mr-2" />
            Gửi tất cả
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card className="border-0 shadow-xl shadow-slate-100/50">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50 border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-800">
              {editingReminder ? "Chỉnh sửa" : editingSentReminder ? "Tạo nhắc nhở mới" : (newReminder as any).id ? "Chỉnh sửa" : "Thêm"} nhắc nhở CRC
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="loai_bt_crc">Loại BT CRC</Label>
                  <div ref={loaiCRCRef}>
                    <AutoCompleteInput
                      id="loai_bt_crc"
                      value={String(newReminder.loai_bt_crc || "")}
                      onChange={(value: string) => setNewReminder({ ...newReminder, loai_bt_crc: value })}
                      suggestions={crcSuggestions}
                      placeholder="Nhập/xuất/mượn - Số - Tên TS"
                      className="h-12"
                      stayAfterTabSelect
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ngay_thuc_hien">Ngày thực hiện</Label>
                  <div ref={ngayThucHienRef}>
                    <DateInput
                      id="ngay_thuc_hien"
                      value={String(newReminder.ngay_thuc_hien || "")}
                      onChange={(value: string) => setNewReminder({ ...newReminder, ngay_thuc_hien: value })}
                      className="h-12"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldpcrc">LĐPCRC</Label>
                  <div ref={ldpcrcRef}>
                    <AutoCompleteInput
                      id="ldpcrc"
                      value={String(newReminder.ldpcrc || "")}
                      onChange={(value: string) => setNewReminder({ ...newReminder, ldpcrc: value })}
                      suggestions={ldpcrcStaff.map(s => s.ten_nv).filter(Boolean)}
                      placeholder="Nhập tên LĐP duyệt CRC"
                      className="h-12"
                      onOpenSuggestions={ensureLDPCRCLoaded}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cbcrc">CBCRC</Label>
                  <div ref={cbcrcRef}>
                    <AutoCompleteInput
                      id="cbcrc"
                      value={String(newReminder.cbcrc || "")}
                      onChange={(value: string) => setNewReminder({ ...newReminder, cbcrc: value })}
                      suggestions={cbcrcStaff.map(s => s.ten_nv).filter(Boolean)}
                      placeholder="Nhập tên CB làm CRC"
                      className="h-12"
                      onOpenSuggestions={ensureCBCRCLoaded}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quycrc">QUYCRC</Label>
                  <div ref={quycrcRef}>
                    <AutoCompleteInput
                      id="quycrc"
                      value={String(newReminder.quycrc || "")}
                      onChange={(value: string) => setNewReminder({ ...newReminder, quycrc: value })}
                      suggestions={quycrcStaff.map(s => s.ten_nv).filter(Boolean)}
                      placeholder="Nhập tên Thủ quỹ duyệt CRC"
                      className="h-12"
                      onOpenSuggestions={ensureQUYCRCLoaded}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" onClick={clearForm} variant="outline" tabIndex={-1}>
                  Làm mới Form
                </Button>
                {(editingReminder || editingSentReminder || (newReminder as any).id) && (
                  <Button type="button" onClick={cancelEdit} variant="outline" tabIndex={-1}>
                    Hủy
                  </Button>
                )}
                <Button
                  ref={addButtonRef}
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={isSending}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {editingReminder ? "Cập nhật" : editingSentReminder ? "Tạo nhắc nhở mới" : (newReminder as any).id ? "Cập nhật" : "Thêm"} nhắc nhở
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl shadow-slate-100/50">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-semibold text-slate-800">
                Danh sách chờ gửi ({filteredWaiting.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại BT CRC</TableHead>
                    <TableHead>Ngày TH</TableHead>
                    <TableHead>LĐPCRC</TableHead>
                    <TableHead>CBCRC</TableHead>
                    <TableHead>QUYCRC</TableHead>
                    <TableHead>Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWaiting.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4 text-slate-500">
                        {searchText ? "Không tìm thấy nhắc nhở nào." : "Chưa có nhắc nhở nào trong danh sách chờ."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWaiting.map((reminder) => (
                      <TableRow key={reminder.id}>
                        <TableCell className="font-medium">{reminder.loai_bt_crc}</TableCell>
                        <TableCell>{reminder.ngay_thuc_hien}</TableCell>
                        <TableCell>{reminder.ldpcrc || "-"}</TableCell>
                        <TableCell>{reminder.cbcrc || "-"}</TableCell>
                        <TableCell>{reminder.quycrc || "-"}</TableCell>
                        <TableCell className="min-w-[120px]">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => sendOne(reminder)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 p-2 h-auto"
                              title="Gửi nhắc nhở này"
                              disabled={isSending}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => editReminder(reminder)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-2 h-auto"
                              title="Chỉnh sửa"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {currentUser?.role === "admin" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteReminder(reminder.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 h-auto"
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {showProgress && sendProgress.length > 0 && (
          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800">Tiến trình gửi nhắc nhở CRC</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2">
                {sendProgress.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-b-0">
                    <div className="font-medium text-slate-700 flex-grow truncate mr-2">{p.loai_bt_crc}</div>
                    <div className="flex items-center gap-2">
                      {p.status === "pending" && <span className="text-slate-500 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang chờ...</span>}
                      {p.status === "sending" && <span className="text-blue-600 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang gửi...</span>}
                      {p.status === "success" && <span className="text-green-600 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Thành công</span>}
                      {p.status === "error" && <span className="text-red-600 flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Lỗi</span>}
                      {p.message && <span className="text-slate-400 text-xs">({p.message})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-xl shadow-slate-100/50">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-green-50 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-semibold text-slate-800">Danh sách đã gửi ({sentReminders.length})</CardTitle>
              {currentUser?.role === "admin" && (
                <Button onClick={deleteAllSent} variant="destructive">
                  <Trash className="w-4 h-4 mr-2" />
                  Xóa tất cả
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại BT CRC</TableHead>
                    <TableHead>Ngày TH</TableHead>
                    <TableHead>LĐPCRC</TableHead>
                    <TableHead>CBCRC</TableHead>
                    <TableHead>QUYCRC</TableHead>
                    <TableHead>Ngày gửi</TableHead>
                    {currentUser?.role === "admin" && <TableHead>Thao tác</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sentReminders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={currentUser?.role === "admin" ? 7 : 6} className="text-center py-4 text-slate-500">
                        Chưa có nhắc nhở nào đã gửi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sentReminders.map((reminder) => (
                      <TableRow key={reminder.id}>
                        <TableCell className="font-medium">{reminder.loai_bt_crc}</TableCell>
                        <TableCell>{reminder.ngay_thuc_hien}</TableCell>
                        <TableCell>{reminder.ldpcrc || "-"}</TableCell>
                        <TableCell>{reminder.cbcrc || "-"}</TableCell>
                        <TableCell>{reminder.quycrc || "-"}</TableCell>
                        <TableCell>{format(new Date(reminder.sent_date), "dd/MM/yyyy")}</TableCell>
                        {currentUser?.role === "admin" && (
                          <TableCell className="min-w-[90px]">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSentReminder(reminder);
                                  setEditingReminder(null);
                                  setNewReminder({
                                    loai_bt_crc: reminder.loai_bt_crc,
                                    ngay_thuc_hien: reminder.ngay_thuc_hien,
                                    ldpcrc: reminder.ldpcrc || "",
                                    cbcrc: reminder.cbcrc || "",
                                    quycrc: reminder.quycrc || "",
                                  });
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-2 h-auto"
                                title="Tạo nhắc nhở mới từ đây"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteReminder(reminder.id, true)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 h-auto"
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CRCTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        template={emailTemplate}
        onTemplateChange={setEmailTemplate}
        sampleReminder={{
          loai_bt_crc: String(newReminder.loai_bt_crc || "Nhập kho - 001 - HS ABC"),
          ngay_thuc_hien: String(newReminder.ngay_thuc_hien || "01-01"),
          ldpcrc: String(newReminder.ldpcrc || ""),
          cbcrc: String(newReminder.cbcrc || ""),
          quycrc: String(newReminder.quycrc || ""),
          so_chung_tu: (newReminder as any)?.so_chung_tu,
          ten_ts: (newReminder as any)?.ten_ts,
        }}
        recipientsBlock={computedRecipientsBlock}
        currentUsername={currentUser?.username}
      />

     {/* Keyboard shortcuts & Tab trap */}
     {(() => {
       const focusOrder = [loaiCRCRef, ngayThucHienRef, ldpcrcRef, cbcrcRef, quycrcRef, addButtonRef];
       const focusByIndex = (idx: number) => {
         const ref: any = focusOrder[(idx + focusOrder.length) % focusOrder.length];
         if (ref && ref.current) {
           const input = typeof ref.current.querySelector === "function" ? ref.current.querySelector("input") : null;
           (input || ref.current).focus?.();
         }
       };
       const findCurrentIndex = () => {
         const ae = document.activeElement;
         return focusOrder.findIndex((r: any) => {
           if (!r || !r.current) return false;
           if (r.current === ae) return true;
           const input = typeof r.current.querySelector === "function" ? r.current.querySelector("input") : null;
           return input && input === ae;
         });
       };
       useEffect(() => {
         const onKeyDown = (e: KeyboardEvent) => {
           // Shortcuts
           if (e.ctrlKey && e.shiftKey) {
             const key = (e.key || "").toLowerCase();
             if (key === "t") {
               e.preventDefault();
               (addButtonRef.current as any)?.click?.();
               return;
             }
             if (key === "g") {
               e.preventDefault();
               sendToday();
               return;
             }
           }
           // Tab trap across our inputs/buttons
           if (e.key === "Tab") {
             const ae = document.activeElement as HTMLElement | null;
             const acRoot = ae && (ae.closest?.("[data-autocomplete-root]") as HTMLElement | null);
             const isAcOpen = acRoot && acRoot.getAttribute("data-open") === "true";
             const isFocusedInForm =
               focusOrder.some((r: any) => {
                 if (!r || !r.current) return false;
                 const input = typeof r.current.querySelector === "function" ? r.current.querySelector("input") : null;
                 return r.current === ae || input === ae;
               }) || addButtonRef.current === ae;
             if (isFocusedInForm && !isAcOpen) {
               e.preventDefault();
               const cur = findCurrentIndex();
               const dir = e.shiftKey ? -1 : 1;
               if (cur === -1) focusByIndex(0);
               else focusByIndex(cur + dir);
             }
           }
         };
         window.addEventListener("keydown", onKeyDown, true);
         return () => window.removeEventListener("keydown", onKeyDown, true);
       }, [sendToday]);
       return null;
     })()}
    </div>
  );
}