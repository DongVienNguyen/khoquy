"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, addDays, startOfWeek, endOfWeek, isWithinInterval, getWeek, getYear } from "date-fns";
import { useRouter } from "next/navigation";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { FileText, Download, Calendar as CalendarIcon, Filter, ListTree, ChevronLeft, ChevronRight, Plus, CheckCircle, Edit, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";

type SafeStaff = {
  id: string;
  username: string;
  staff_name: string;
  email: string | null;
  role: "admin" | "user";
  department: string | null;
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
  deleted_at?: string | null;
  deleted_by?: string | null;
  change_logs?: any[];
};

type ProcessedNote = {
  id: string;
  created_date: string;
  updated_date: string;
  created_by: string | null;
  room: "QLN" | "CMT8" | "NS" | "ĐS" | "LĐH" | "NQ";
  operation_type: "Hoàn trả" | "Xuất kho" | "Nhập kho" | "Xuất mượn" | "Thiếu CT" | "Khác";
  content: string;
  staff_code: string;
  is_done: boolean;
  done_at: string | null;
  mail_to_nv: string | null;
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

const FUNCTION_URL = `${SUPABASE_PUBLIC_URL}/functions/v1/asset-transactions`;
async function callFunc(body: Record<string, any>) {
  try {
    const { data, error } = await supabase.functions.invoke("asset-transactions", { body });
    if (!error) {
      const payload = data ?? null;
      const normalized = payload && typeof payload === "object" && "data" in (payload as any)
        ? (payload as any).data
        : payload;
      return { ok: true, data: normalized };
    }
  } catch {}
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
    if (res.ok && json) return { ok: true, data: (json as any).data };
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed" };
  }
}

function getNextWorkingDay(date = new Date()): Date {
  const d = new Date(date);
  const dow = d.getDay();
  let add = 1;
  if (dow === 5) add = 3; // Fri -> Mon
  else if (dow === 6) add = 2; // Sat -> Mon
  return addDays(d, add);
}

function getMorningTargetDate(): Date {
  const now = new Date();
  const gmt7Hour = (now.getUTCHours() + 7) % 24;
  const gmt7Minute = now.getMinutes();
  const val = gmt7Hour * 100 + gmt7Minute;
  if (val >= 806) return getNextWorkingDay(now);
  return now;
}

function getCurrentWeekYear(): string {
  const now = new Date();
  const year = getYear(now);
  const week = getWeek(now, { weekStartsOn: 1 });
  return `${year}-${String(week).padStart(2, "0")}`;
}

function getScopedDateRange() {
  const today = new Date();
  const start = format(today, "yyyy-MM-dd");
  const next = getNextWorkingDay(today);
  const end = format(next, "yyyy-MM-dd");
  return { start, end };
}

export default function DailyReportPage() {
  const router = useRouter();
  const [currentStaff, setCurrentStaff] = useState<SafeStaff | null>(null);

  const [allTransactions, setAllTransactions] = useState<AssetTx[]>([]);
  const [processedNotes, setProcessedNotes] = useState<ProcessedNote[]>([]);
  const [takenTransactionIds, setTakenTransactionIds] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showGrouped, setShowGrouped] = useState(true);

  const [filterType, setFilterType] = useState<string>("");
  const [customFilters, setCustomFilters] = useState<{ start: string; end: string; parts_day: "all" | "Sáng" | "Chiều"; }>({
    start: format(new Date(), "yyyy-MM-dd"),
    end: format(new Date(), "yyyy-MM-dd"),
    parts_day: "all",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [noteFormData, setNoteFormData] = useState<{ room: string; operation_type: string; content: string; mail_to_nv: string; }>({
    room: "",
    operation_type: "",
    content: "",
    mail_to_nv: "",
  });
  const [editingNote, setEditingNote] = useState<ProcessedNote | null>(null);
  const [isEditNoteDialogOpen, setIsEditNoteDialogOpen] = useState(false);
  const [editNoteFormData, setEditNoteFormData] = useState<{ room: string; operation_type: string; content: string; }>({
    room: "",
    operation_type: "",
    content: "",
  });

  const [editingTransaction, setEditingTransaction] = useState<AssetTx | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});

  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const autoRefreshRef = useRef<any>(null);
  const hasInitializedFilter = useRef(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Refs để giữ state ổn định cho backgroundRefresh/loadAllTransactions
  const isFetchingDataRef = useRef(false);
  useEffect(() => { isFetchingDataRef.current = isFetchingData; }, [isFetchingData]);

  const canManageDailyReportRef = useRef(false);
  useEffect(() => { canManageDailyReportRef.current = !!(currentStaff?.department === "NQ"); }, [currentStaff]);

  const canSeeTakenColumnRef = useRef(false);
  useEffect(() => { canSeeTakenColumnRef.current = !!(currentStaff?.department === "NQ"); }, [currentStaff]);

  const currentUsernameRef = useRef<string | undefined>(undefined);
  useEffect(() => { currentUsernameRef.current = currentStaff?.username; }, [currentStaff]);

  // Debounce hiển thị trạng thái auto refreshing để tránh chớp
  const [showAutoRefreshing, setShowAutoRefreshing] = useState(false);
  useEffect(() => {
    if (autoRefresh && !isManualRefreshing && isFetchingData) {
      const t = setTimeout(() => setShowAutoRefreshing(true), 400);
      return () => clearTimeout(t);
    }
    setShowAutoRefreshing(false);
  }, [autoRefresh, isManualRefreshing, isFetchingData]);

  useEffect(() => {
    const raw = getLoggedInStaff();
    if (!raw) {
      router.replace("/sign-in");
      return;
    }
    setCurrentStaff(raw);
  }, [router]);

  const canManageDailyReport = useMemo(() => currentStaff?.department === "NQ", [currentStaff]);
  const canSeeTakenColumn = useMemo(() => currentStaff?.department === "NQ", [currentStaff]);
  const isAdmin = useMemo(() => currentStaff?.role === "admin", [currentStaff]);

  // Nạp giá trị autoRefresh từ localStorage sau khi mount để tránh lệch trạng thái khi hydrate
  useEffect(() => {
    try {
      const saved = localStorage.getItem("autoRefreshEnabled");
      if (saved !== null) setAutoRefresh(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("autoRefreshEnabled", JSON.stringify(autoRefresh));
  }, [autoRefresh]);

  const loadProcessedNotes = useCallback(async () => {
    const res = await callFunc({ action: "list_notes" });
    if (!res.ok) return;
    setProcessedNotes(Array.isArray(res.data) ? (res.data as ProcessedNote[]) : []);
  }, []);

  const loadTakenStatus = useCallback(async () => {
    if (!currentStaff?.username || !canSeeTakenColumn) {
      setTakenTransactionIds(new Set());
      return;
    }
    const week = getCurrentWeekYear();
    const res = await callFunc({ action: "list_taken_status", user_username: currentStaff.username, week_year: week });
    if (!res.ok) {
      setTakenTransactionIds(new Set());
      return;
    }
    const list = Array.isArray(res.data) ? (res.data as any[]) : [];
    const ids = new Set(list.map((x) => String(x.transaction_id)));
    setTakenTransactionIds(ids);
  }, [currentStaff?.username, canSeeTakenColumn]);

  const loadAllTransactions = useCallback(async (useCache: boolean = true, isManual: boolean = false) => {
    if (isFetchingDataRef.current) return;
    if (isManual) setIsManualRefreshing(true);
    setIsFetchingData(true);
    setIsLoading(true);
    try {
      const range = getScopedDateRange();
      const res = await callFunc({ action: "list_range", start: range.start, end: range.end, parts_day: null, include_deleted: true });
      if (!res.ok) {
        setAllTransactions([]);
      } else {
        setAllTransactions(Array.isArray(res.data) ? (res.data as AssetTx[]) : []);
      }
      setLastRefreshTime(new Date());
    } finally {
      setIsLoading(false);
      setIsFetchingData(false);
      if (isManual) setIsManualRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Defer initial heavy fetch một lần
    const run = () => loadAllTransactions(true, false);
    let h: any;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      // @ts-ignore
      h = window.requestIdleCallback(run, { timeout: 1000 });
    } else {
      h = setTimeout(run, 50);
    }
    if (canManageDailyReport) loadProcessedNotes();
    if (canSeeTakenColumn) loadTakenStatus();
    return () => {
      if (typeof window !== "undefined" && "cancelIdleCallback" in window && h) {
        // @ts-ignore
        window.cancelIdleCallback(h);
      } else if (h) {
        clearTimeout(h);
      }
    };
  }, [/* chạy một lần sau mount */]);

  useEffect(() => {
    if (hasInitializedFilter.current) return;
    const now = new Date();
    const gmt7Hour = (now.getUTCHours() + 7) % 24;
    const gmt7Minute = now.getMinutes();
    const val = gmt7Hour * 100 + gmt7Minute;
    if (val >= 811 && val <= 1310) setFilterType("afternoon");
    else setFilterType("qln_pgd_next_day");
    hasInitializedFilter.current = true;
  }, []);

  const backgroundRefresh = useCallback(async () => {
    if (document.hidden || isFetchingDataRef.current) return;

    setIsFetchingData(true);
    try {
      const range = getScopedDateRange();
      const resTx = await callFunc({ action: "list_range", start: range.start, end: range.end, parts_day: null, include_deleted: true });

      const doNotes = canManageDailyReportRef.current;
      const doTaken = canSeeTakenColumnRef.current && !!currentUsernameRef.current;

      const resNotes = doNotes ? await callFunc({ action: "list_notes" }) : { ok: false, data: [] as any };
      const resTaken = doTaken
        ? await callFunc({ action: "list_taken_status", user_username: currentUsernameRef.current, week_year: getCurrentWeekYear() })
        : { ok: false, data: [] as any };

      if (resTx.ok) setAllTransactions(Array.isArray(resTx.data) ? (resTx.data as AssetTx[]) : []);
      if (resNotes.ok) setProcessedNotes(Array.isArray(resNotes.data) ? (resNotes.data as ProcessedNote[]) : []);
      if (resTaken.ok) {
        const list = Array.isArray(resTaken.data) ? (resTaken.data as any[]) : [];
        setTakenTransactionIds(new Set(list.map((x) => String(x.transaction_id))));
      }
      setLastRefreshTime(new Date());
    } finally {
      setIsFetchingData(false);
    }
  }, []);

  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    let timeoutId: any = null;
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => backgroundRefresh(), 60000);
      timeoutId = setTimeout(() => backgroundRefresh(), 5000);
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [autoRefresh]); // không phụ thuộc backgroundRefresh để tránh re-create interval

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, customFilters]);

  // Restricted time guard (same windows as AssetEntry)
  const isRestrictedNow = useCallback(() => {
    const now = new Date();
    const gmt7Hour = (now.getUTCHours() + 7) % 24;
    const minutes = now.getUTCMinutes();
    const current = gmt7Hour * 60 + minutes;
    return (current >= 465 && current <= 485) || (current >= 765 && current <= 785);
  }, []);
  const gmt7TodayStr = useMemo(() => {
    const now = new Date();
    const gmt7 = new Date(now.getTime() + 7 * 3600 * 1000);
    return format(gmt7, "yyyy-MM-dd");
  }, []);

  const canActOnTransaction = useCallback((t: AssetTx) => {
    if (isAdmin) return true;
    const isOwner = t.staff_code && currentStaff?.username && t.staff_code === currentStaff.username;
    if (!isOwner) return false;
    if (isRestrictedNow()) return false;
    const txDateStr = format(new Date(t.transaction_date), "yyyy-MM-dd");
    return txDateStr >= gmt7TodayStr;
  }, [currentStaff?.username, gmt7TodayStr, isRestrictedNow, isAdmin]);

  // Filtered base sets
  const filteredTransactions = useMemo(() => {
    const transactions = (allTransactions || []).filter(Boolean);
    if (transactions.length === 0) return [];
    let filtered: AssetTx[] = [];

    if (filterType === "qln_pgd_next_day") {
      const targetDate = getMorningTargetDate();
      const targetStr = format(targetDate, "yyyy-MM-dd");
      const pgdRooms = ["CMT8", "NS", "ĐS", "LĐH"];
      filtered = transactions.filter((t) => {
        const matchesDate = format(new Date(t.transaction_date), "yyyy-MM-dd") === targetStr;
        if (!matchesDate) return false;
        const isMorning = t.parts_day === "Sáng";
        const isPgdAfternoon = t.parts_day === "Chiều" && pgdRooms.includes(t.room);
        return isMorning || isPgdAfternoon;
      });
    } else if (filterType === "next_day") {
      const targetDate = getNextWorkingDay();
      const targetStr = format(targetDate, "yyyy-MM-dd");
      filtered = transactions.filter((t) => format(new Date(t.transaction_date), "yyyy-MM-dd") === targetStr);
    } else if (filterType === "custom") {
      const start = new Date(customFilters.start + "T00:00:00");
      const end = new Date(customFilters.end + "T23:59:59");
      const parts = customFilters.parts_day === "all" ? null : customFilters.parts_day;
      filtered = transactions.filter((t) => {
        const dt = new Date(t.transaction_date);
        const dateMatch = dt >= start && dt <= end;
        const partsMatch = !parts || t.parts_day === parts;
        return dateMatch && partsMatch;
      });
    } else {
      let target: Date;
      let parts: "Sáng" | "Chiều" | null;
      if (filterType === "morning") {
        target = getMorningTargetDate();
        parts = "Sáng";
      } else if (filterType === "afternoon") {
        target = new Date();
        parts = "Chiều";
      } else {
        target = new Date();
        parts = null;
      }
      const targetStr = format(target, "yyyy-MM-dd");
      filtered = transactions.filter((t) => {
        const dateMatch = format(new Date(t.transaction_date), "yyyy-MM-dd") === targetStr;
        const partsMatch = !parts || t.parts_day === parts;
        return dateMatch && partsMatch;
      });
    }

    // exclude soft-deleted
    return filtered.filter((t) => !t.is_deleted).sort((a, b) => {
      if (a.room !== b.room) return a.room.localeCompare(b.room);
      if (a.asset_year !== b.asset_year) return a.asset_year - b.asset_year;
      return (a.asset_code || 0) - (b.asset_code || 0);
    });
  }, [allTransactions, filterType, customFilters]);

  const filteredDeletedTransactions = useMemo(() => {
    const transactions = (allTransactions || []).filter(Boolean);
    if (transactions.length === 0) return [];
    // reuse same logic then keep only deleted
    let base: AssetTx[] = [];
    // keep logic same as above
    const tmp = (function (): AssetTx[] {
      if (filterType === "qln_pgd_next_day") {
        const targetDate = getMorningTargetDate();
        const targetStr = format(targetDate, "yyyy-MM-dd");
        const pgdRooms = ["CMT8", "NS", "ĐS", "LĐH"];
        return transactions.filter((t) => {
          const matchesDate = format(new Date(t.transaction_date), "yyyy-MM-dd") === targetStr;
          if (!matchesDate) return false;
          const isMorning = t.parts_day === "Sáng";
          const isPgdAfternoon = t.parts_day === "Chiều" && pgdRooms.includes(t.room);
          return isMorning || isPgdAfternoon;
        });
      } else if (filterType === "next_day") {
        const targetDate = getNextWorkingDay();
        const targetStr = format(targetDate, "yyyy-MM-dd");
        return transactions.filter((t) => format(new Date(t.transaction_date), "yyyy-MM-dd") === targetStr);
      } else if (filterType === "custom") {
        const start = new Date(customFilters.start + "T00:00:00");
        const end = new Date(customFilters.end + "T23:59:59");
        const parts = customFilters.parts_day === "all" ? null : customFilters.parts_day;
        return transactions.filter((t) => {
          const dt = new Date(t.transaction_date);
          const dateMatch = dt >= start && dt <= end;
          const partsMatch = !parts || t.parts_day === parts;
          return dateMatch && partsMatch;
        });
      } else {
        let target: Date;
        let parts: "Sáng" | "Chiều" | null;
        if (filterType === "morning") {
          target = getMorningTargetDate();
          parts = "Sáng";
        } else if (filterType === "afternoon") {
          target = new Date();
          parts = "Chiều";
        } else {
          target = new Date();
          parts = null;
        }
        const targetStr = format(target, "yyyy-MM-dd");
        return transactions.filter((t) => {
          const dateMatch = format(new Date(t.transaction_date), "yyyy-MM-dd") === targetStr;
          const partsMatch = !parts || t.parts_day === parts;
          return dateMatch && partsMatch;
        });
      }
    })();
    base = tmp;
    return base.filter((t) => t.is_deleted).sort((a, b) => {
      if (a.room !== b.room) return a.room.localeCompare(b.room);
      if (a.asset_year !== b.asset_year) return a.asset_year - b.asset_year;
      return (a.asset_code || 0) - (b.asset_code || 0);
    });
  }, [allTransactions, filterType, customFilters]);

  // Grouped rows
  const startOfCurrentWeek = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const endOfCurrentWeek = useMemo(() => endOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const groupedRows = useMemo(() => {
    const txs = filteredTransactions;
    const notes = processedNotes;
    if (!showGrouped && !(canManageDailyReport && notes.length > 0)) return [];

    // frequency within week
    const freq = new Map<string, number>();
    (allTransactions || []).forEach((t) => {
      const dt = new Date(t.transaction_date);
      if (isWithinInterval(dt, { start: startOfCurrentWeek, end: endOfCurrentWeek })) {
        const key = `${t.room}-${t.asset_year}-${t.asset_code}`;
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    });

    // exclude taken
    const visible = txs.filter((t) => !takenTransactionIds.has(t.id));

    const groupedByRoom: Record<string, AssetTx[]> = {};
    visible.forEach((t) => {
      groupedByRoom[t.room] = groupedByRoom[t.room] || [];
      groupedByRoom[t.room].push(t);
    });
    const roomOrder = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"];
    const sortedRooms = Object.keys(groupedByRoom).sort((a, b) => {
      const ia = roomOrder.indexOf(a);
      const ib = roomOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ib === -1) return -1;
      return ia - ib;
    });

    const rows: any[] = [];
    for (const room of sortedRooms) {
      const byYear: Record<string, AssetTx[]> = {};
      groupedByRoom[room].forEach((t) => {
        const y = String(t.asset_year);
        byYear[y] = byYear[y] || [];
        byYear[y].push(t);
      });
      const sortedYears = Object.keys(byYear).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      for (const y of sortedYears) {
        const codes = byYear[y]
          .sort((a, b) => (a.asset_code || 0) - (b.asset_code || 0))
          .map((t) => {
            const key = `${t.room}-${t.asset_year}-${t.asset_code}`;
            const wasTakenBefore = (freq.get(key) || 0) > 1;
            return `${t.asset_code}${wasTakenBefore ? "*" : ""}`;
          });
        rows.push({ id: `${room}-${y}`, room, year: y, codes: codes.join(", ") });
      }
    }

    if (canManageDailyReport && notes.length > 0) {
      notes.forEach((note) => {
        rows.push({
          id: `note-${note.id}`,
          room: `${note.room} - ${note.operation_type}: ${note.content}`,
          year: "",
          codes: "",
          isNote: true,
          noteData: note,
          isFullWidth: true,
        });
      });
    }
    return rows;
  }, [filteredTransactions, processedNotes, showGrouped, startOfCurrentWeek, endOfCurrentWeek, takenTransactionIds, canManageDailyReport, allTransactions]);

  // Header date display
  const todayFormatted = useMemo(() => format(new Date(), "dd/MM/yyyy"), []);
  const nextWorkingDayFormatted = useMemo(() => format(getNextWorkingDay(new Date()), "dd/MM/yyyy"), []);
  const morningDateFormatted = useMemo(() => format(getMorningTargetDate(), "dd/MM/yyyy"), []);
  const qlnPgdDateFormatted = morningDateFormatted;

  const headerDateDisplay = useMemo(() => {
    switch (filterType) {
      case "morning":
        return `Sáng ngày (${morningDateFormatted})`;
      case "qln_pgd_next_day":
        return `QLN Sáng & PGD trong ngày (${qlnPgdDateFormatted})`;
      case "afternoon":
        return `Chiều ngày (${todayFormatted})`;
      case "today":
        return `Trong ngày hôm nay (${todayFormatted})`;
      case "next_day":
        return `Trong ngày kế tiếp (${nextWorkingDayFormatted})`;
      case "custom": {
        const start = new Date(customFilters.start + "T00:00:00");
        const end = new Date(customFilters.end + "T00:00:00");
        let s = start.getTime() === end.getTime() ? `Ngày ${format(start, "dd/MM/yyyy")}` : `Từ ${format(start, "dd/MM/yyyy")} đến ${format(end, "dd/MM/yyyy")}`;
        if (customFilters.parts_day === "Sáng") s += " (Sáng)";
        else if (customFilters.parts_day === "Chiều") s += " (Chiều)";
        return s;
      }
      default:
        return "";
    }
  }, [filterType, customFilters, todayFormatted, nextWorkingDayFormatted, morningDateFormatted, qlnPgdDateFormatted]);

  // Pagination
  const totalPages = useMemo(() => Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE), [filteredTransactions]);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  const formatGmt7TimeNhan = useCallback((iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    const g = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const hh = String(g.getUTCHours()).padStart(2, "0");
    const mm = String(g.getUTCMinutes()).padStart(2, "0");
    const dd = String(g.getUTCDate()).padStart(2, "0");
    const mo = String(g.getUTCMonth() + 1).padStart(2, "0");
    return `${hh}:${mm} - ${dd}/${mo}`;
  }, []);

  const handleToggleTakenStatus = useCallback(async (transactionId: string) => {
    if (currentStaff?.department !== "NQ") return;
    const res = await callFunc({
      action: "toggle_taken_status",
      transaction_id: transactionId,
      user_username: currentStaff.username,
      week_year: getCurrentWeekYear(),
    });
    if (!res.ok) return;
    const taken = !!(res.data as any)?.taken;
    setTakenTransactionIds((prev) => {
      const next = new Set(prev);
      if (taken) next.add(transactionId);
      else next.delete(transactionId);
      return next;
    });
  }, [currentStaff]);

  const handleEditTransaction = useCallback((t: AssetTx) => {
    const allowed = t.is_deleted ? isAdmin : canActOnTransaction(t);
    if (!allowed) {
      toast.error("Bạn không có quyền chỉnh sửa mục này hoặc đang trong thời gian bị khóa.");
      return;
    }
    if (!confirm("Bạn muốn chỉnh sửa giao dịch này?")) return;
    setEditingTransaction(t);
    setEditFormData({
      transaction_date: format(new Date(t.transaction_date), "yyyy-MM-dd"),
      parts_day: t.parts_day,
      room: t.room,
      transaction_type: t.transaction_type,
      asset_year: t.asset_year,
      asset_code: t.asset_code,
      note: t.note || "",
    });
    setIsEditDialogOpen(true);
  }, [canActOnTransaction, isAdmin]);

  const handleUpdateTransaction = useCallback(async () => {
    if (!editingTransaction) return;
    const allowed = editingTransaction.is_deleted ? isAdmin : canActOnTransaction(editingTransaction);
    if (!allowed) {
      toast.error("Bạn không có quyền cập nhật mục này hoặc đang trong thời gian bị khóa.");
      return;
    }
    if (!confirm("Xác nhận cập nhật giao dịch?")) return;
    const res = await callFunc({
      action: "update_transaction",
      id: editingTransaction.id,
      patch: editFormData,
      editor_username: currentStaff?.username || "unknown",
    });
    if (!res.ok) {
      toast.error("Lỗi khi cập nhật giao dịch. Vui lòng thử lại.");
      return;
    }
    setIsEditDialogOpen(false);
    setEditingTransaction(null);
    toast.success("Cập nhật giao dịch thành công!");
    loadAllTransactions(false);
  }, [editingTransaction, editFormData, currentStaff?.username, isAdmin, canActOnTransaction, loadAllTransactions]);

  const handleDeleteTransaction = useCallback(async (transactionId: string) => {
    const t = allTransactions.find((x) => x.id === transactionId);
    if (!t) return;
    const allowed = t.is_deleted ? isAdmin : canActOnTransaction(t);
    if (!allowed) {
      toast.error("Bạn không có quyền xóa mục này hoặc đang trong thời gian bị khóa.");
      return;
    }
    if (!confirm(t.is_deleted ? "Xóa vĩnh viễn bản ghi này?" : "Bạn có chắc chắn muốn xóa (mềm) giao dịch này?")) return;
    if (t.is_deleted && isAdmin) {
      const res = await callFunc({ action: "hard_delete_transaction", id: transactionId });
      if (!res.ok) {
        toast.error("Lỗi khi xóa giao dịch. Vui lòng thử lại.");
        return;
      }
    } else {
      const res = await callFunc({ action: "soft_delete", id: transactionId, deleted_by: currentStaff?.username || "unknown" });
      if (!res.ok) {
        toast.error("Lỗi khi xóa giao dịch. Vui lòng thử lại.");
        return;
      }
    }
    toast.success("Thao tác xóa thành công!");
    loadAllTransactions(false);
  }, [allTransactions, currentStaff?.username, isAdmin, canActOnTransaction, loadAllTransactions]);

  const handleNoteSubmit = useCallback(async () => {
    if (!canManageDailyReport) return;
    if (!noteFormData.content.trim()) {
      toast.error("Vui lòng nhập nội dung ghi chú.");
      return;
    }
    const res = await callFunc({
      action: "create_note",
      note: {
        created_by: currentStaff?.email || null,
        room: noteFormData.room,
        operation_type: noteFormData.operation_type,
        content: noteFormData.content,
        staff_code: currentStaff?.username || "unknown",
        mail_to_nv: noteFormData.mail_to_nv || null,
      },
    });
    if (!res.ok) {
      toast.error("Lỗi khi tạo ghi chú.");
      return;
    }
    toast.success("Đã tạo ghi chú");
    setNoteFormData({ room: "", operation_type: "", content: "", mail_to_nv: "" });
    setIsNotesDialogOpen(false);
    loadProcessedNotes();
  }, [canManageDailyReport, noteFormData, currentStaff, loadProcessedNotes]);

  const handleEditNote = useCallback((note: ProcessedNote) => {
    if (!canManageDailyReport) return;
    setEditingNote(note);
    setEditNoteFormData({ room: note.room, operation_type: note.operation_type, content: note.content });
    setIsEditNoteDialogOpen(true);
  }, [canManageDailyReport]);

  const handleUpdateNote = useCallback(async () => {
    if (!canManageDailyReport || !editingNote) return;
    const res = await callFunc({
      action: "update_note_full",
      id: editingNote.id,
      patch: { room: editNoteFormData.room, operation_type: editNoteFormData.operation_type, content: editNoteFormData.content },
    });
    if (!res.ok) {
      toast.error("Lỗi khi cập nhật ghi chú.");
      return;
    }
    toast.success("Đã cập nhật ghi chú");
    setIsEditNoteDialogOpen(false);
    setEditingNote(null);
    loadProcessedNotes();
  }, [canManageDailyReport, editingNote, editNoteFormData, loadProcessedNotes]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!canManageDailyReport) return;
    if (!confirm("Bạn có chắc chắn muốn xóa ghi chú này?")) return;
    const res = await callFunc({ action: "delete_note", id: noteId });
    if (!res.ok) {
      toast.error("Lỗi khi xóa ghi chú.");
      return;
    }
    toast.success("Đã xóa ghi chú");
    loadProcessedNotes();
  }, [canManageDailyReport, loadProcessedNotes]);

  const handleNoteDone = useCallback(async (noteId: string) => {
    if (!canManageDailyReport) return;
    const res = await callFunc({ action: "mark_note_done", id: noteId });
    if (!res.ok) {
      toast.error("Lỗi khi đánh dấu ghi chú đã xong.");
      return;
    }
    toast.success("Đã đánh dấu ghi chú đã xử lý");
    loadProcessedNotes();
  }, [canManageDailyReport, loadProcessedNotes]);

  const exportToPDF = async () => {
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 500));
    window.print();
    setIsExporting(false);
  };

  const exportFilteredCSV = useCallback(() => {
    if (!filteredTransactions.length) {
      toast.info("Không có dữ liệu để xuất.");
      return;
    }
    const esc = (s: any) => {
      const v = String(s ?? "");
      const w = v.replace(/"/g, '""');
      return /[",\n\r]/.test(w) ? `"${w}"` : w;
    };
    const header = ["Phòng","Năm TS","Mã TS","Loại","Ngày","Buổi","Ghi chú","CB","Time nhắn","ID"];
    const lines: string[] = [header.join(",")];
    for (const t of filteredTransactions) {
      lines.push([
        esc(t.room),
        esc(t.asset_year),
        esc(t.asset_code),
        esc(t.transaction_type),
        esc(t.transaction_date),
        esc(t.parts_day),
        esc(t.note || ""),
        esc(t.staff_code),
        esc(t.notified_at),
        esc(t.id),
      ].join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DailyReport_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filteredTransactions]);

  const todayText = useMemo(() => {
    const nowLocal = new Date();
    const sWeek = format(startOfCurrentWeek, "II");
    const sYear = format(startOfCurrentWeek, "yyyy");
    return `Tuần ${sWeek} - ${sYear} (${format(startOfCurrentWeek, "dd/MM")} - ${format(endOfCurrentWeek, "dd/MM")})`;
  }, [startOfCurrentWeek, endOfCurrentWeek]);

  // Auto scroll đến nội dung chính trên mobile để dễ xem
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;
    const el = document.getElementById("main-content-section");
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }
  }, []);

  return (
    <div className="p-4 md:p-8">
      <SonnerToaster />
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-section, #print-section * { visibility: visible; }
          #print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none; }
        }
      `}</style>

      <div className="mb-8 no-print">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Danh sách TS cần lấy</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 mt-1">
                <span suppressHydrationWarning>{todayText}</span>
                {lastRefreshTime && (
                  <span className="text-xs text-green-600 font-medium">Cập nhật: {format(lastRefreshTime, "HH:mm:ss")}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Nút Bộ lọc cho mobile */}
            <Button onClick={() => setIsMobileFilterOpen(true)} variant="outline" className="md:hidden bg-white hover:bg-slate-50 text-slate-700 shadow-sm">
              <Filter className="w-4 h-4 mr-2" />
              Bộ lọc
            </Button>
            <div className="hidden md:flex items-center gap-2 text-sm">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="data-[state=checked]:bg-green-600" />
              <span className={`font-medium ${autoRefresh ? "text-green-600" : "text-gray-500"}`}>Auto refresh {autoRefresh ? "ON" : "OFF"}</span>
              {autoRefresh && <span className="text-xs text-gray-500">(60s)</span>}
              {autoRefresh && showAutoRefreshing && (
                <span className="text-xs text-green-600 ml-2">Đang tự làm mới...</span>
              )}
            </div>
            <Button onClick={() => loadAllTransactions(false, true)} disabled={isLoading || isManualRefreshing} variant="outline" className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm">
              <RefreshCw className={`w-4 h-4 mr-2 ${isManualRefreshing ? "animate-spin" : ""}`} />
              Làm mới
            </Button>
            <Button onClick={exportFilteredCSV} variant="outline" className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm">
              <Download className="w-4 h-4 mr-2" />
              Xuất CSV
            </Button>
            <Button onClick={exportToPDF} disabled={isExporting} className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg shadow-green-500/25">
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Đang xuất..." : "Xuất PDF"}
            </Button>
            <Button onClick={() => setShowGrouped(!showGrouped)} variant="outline" className="bg-white hover:bg-purple-50 border-purple-600 text-purple-600 shadow-lg shadow-purple-500/10">
              <ListTree className="w-4 h-4 mr-2" />
              {showGrouped ? "Ẩn DS" : "Hiện DS"}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Filter Dialog */}
      <Dialog open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen}>
        <DialogContent className="max-w-md md:hidden">
          <DialogHeader><DialogTitle>Bộ lọc</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={filterType} onValueChange={setFilterType} className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="morning" id="m_morning" />
                <Label htmlFor="m_morning" className="font-normal">Sáng ngày ({morningDateFormatted})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="qln_pgd_next_day" id="m_qlnpgd" />
                <Label htmlFor="m_qlnpgd" className="font-normal">QLN Sáng & PGD trong ngày ({qlnPgdDateFormatted})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="afternoon" id="m_afternoon" />
                <Label htmlFor="m_afternoon" className="font-normal">Chiều ngày ({todayFormatted})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="today" id="m_today" />
                <Label htmlFor="m_today" className="font-normal">Trong ngày hôm nay ({todayFormatted})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="next_day" id="m_nextday" />
                <Label htmlFor="m_nextday" className="font-normal">Trong ngày kế tiếp ({nextWorkingDayFormatted})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="m_custom" />
                <Label htmlFor="m_custom" className="font-normal">Tùy chọn khoảng thời gian</Label>
              </div>
            </RadioGroup>
            {filterType === "custom" && (
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Buổi</Label>
                  <Select value={customFilters.parts_day} onValueChange={(v) => setCustomFilters({ ...customFilters, parts_day: v as any })}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Chọn buổi" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="Sáng">Sáng</SelectItem>
                      <SelectItem value="Chiều">Chiều</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Từ ngày</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start h-11">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customFilters.start ? format(new Date(customFilters.start), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={customFilters.start ? new Date(customFilters.start) : undefined}
                        onSelect={(date) => date && setCustomFilters({ ...customFilters, start: format(date, "yyyy-MM-dd") })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Đến ngày</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start h-11">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customFilters.end ? format(new Date(customFilters.end), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={customFilters.end ? new Date(customFilters.end) : undefined}
                        onSelect={(date) => date && setCustomFilters({ ...customFilters, end: format(date, "yyyy-MM-dd") })}
                        disabled={(date) => Boolean(customFilters.start) && date < new Date(customFilters.start)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsMobileFilterOpen(false)}>Đóng</Button>
              <Button onClick={() => setIsMobileFilterOpen(false)} className="bg-blue-600 hover:bg-blue-700">Áp dụng</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div className="hidden md:block">
          <Card className="border-0 shadow-xl shadow-slate-100/50 no-print">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Bộ lọc danh sách cần xem:
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <RadioGroup value={filterType} onValueChange={setFilterType} className="mb-4 space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="morning" id="morning-range" />
                  <Label htmlFor="morning-range" className="font-normal cursor-pointer">
                    Sáng ngày (<span suppressHydrationWarning>{morningDateFormatted}</span>)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="qln_pgd_next_day" id="qln_pgd_next_day-range" />
                  <Label htmlFor="qln_pgd_next_day-range" className="font-normal cursor-pointer">
                    QLN Sáng & PGD trong ngày (<span suppressHydrationWarning>{qlnPgdDateFormatted}</span>)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="afternoon" id="afternoon-range" />
                  <Label htmlFor="afternoon-range" className="font-normal cursor-pointer">
                    Chiều ngày (<span suppressHydrationWarning>{todayFormatted}</span>)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="today" id="today-range" />
                  <Label htmlFor="today-range" className="font-normal cursor-pointer">
                    Trong ngày hôm nay (<span suppressHydrationWarning>{todayFormatted}</span>)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="next_day" id="next_day-range" />
                  <Label htmlFor="next_day-range" className="font-normal cursor-pointer">
                    Trong ngày kế tiếp (<span suppressHydrationWarning>{nextWorkingDayFormatted}</span>)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom-range" />
                  <Label htmlFor="custom-range" className="font-normal cursor-pointer">Tùy chọn khoảng thời gian</Label>
                </div>
              </RadioGroup>
              {filterType === "custom" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-200">
                  <div className="space-y-2">
                    <Label htmlFor="parts_day_filter">Buổi</Label>
                    <Select value={customFilters.parts_day} onValueChange={(v) => setCustomFilters({ ...customFilters, parts_day: v as any })}>
                      <SelectTrigger id="parts_day_filter" className="h-12 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                        <SelectValue placeholder="Chọn buổi" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        <SelectItem value="Sáng">Sáng</SelectItem>
                        <SelectItem value="Chiều">Chiều</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Từ ngày</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={`w-full justify-start text-left font-normal h-12 border-slate-200 ${!customFilters.start ? "text-muted-foreground" : ""}`}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customFilters.start ? format(new Date(customFilters.start), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={customFilters.start ? new Date(customFilters.start) : undefined}
                          onSelect={(date) => date && setCustomFilters({ ...customFilters, start: format(date, "yyyy-MM-dd") })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">Đến ngày</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={`w-full justify-start text-left font-normal h-12 border-slate-200 ${!customFilters.end ? "text-muted-foreground" : ""}`}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customFilters.end ? format(new Date(customFilters.end), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={customFilters.end ? new Date(customFilters.end) : undefined}
                          onSelect={(date) => date && setCustomFilters({ ...customFilters, end: format(date, "yyyy-MM-dd") })}
                          disabled={(date) => Boolean(customFilters.start) && date < new Date(customFilters.start)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div id="print-section" className="space-y-6">
          {showGrouped && (
            <Card className="border-0 shadow-xl shadow-slate-100/50" id="main-content-section">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50 border-b border-slate-200">
                <CardTitle className="text-lg font-semibold text-slate-800 flex justify-between items-center">
                  <span suppressHydrationWarning>{headerDateDisplay}</span>
                  {canManageDailyReport && (
                    <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 bg-blue-50 hover:bg-blue-100 border-blue-600 text-blue-600">
                          <Plus className="w-5 h-5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Thêm ghi chú đã duyệt</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Phòng</Label>
                            <Select value={noteFormData.room} onValueChange={(v) => setNoteFormData({ ...noteFormData, room: v })}>
                              <SelectTrigger><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="QLN">QLN</SelectItem>
                                <SelectItem value="CMT8">CMT8</SelectItem>
                                <SelectItem value="NS">NS</SelectItem>
                                <SelectItem value="ĐS">ĐS</SelectItem>
                                <SelectItem value="LĐH">LĐH</SelectItem>
                                <SelectItem value="NQ">NQ</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Loại tác nghiệp</Label>
                            <Select value={noteFormData.operation_type} onValueChange={(v) => setNoteFormData({ ...noteFormData, operation_type: v })}>
                              <SelectTrigger><SelectValue placeholder="Chọn loại tác nghiệp" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Hoàn trả">Hoàn trả</SelectItem>
                                <SelectItem value="Xuất kho">Xuất kho</SelectItem>
                                <SelectItem value="Nhập kho">Nhập kho</SelectItem>
                                <SelectItem value="Xuất mượn">Xuất mượn</SelectItem>
                                <SelectItem value="Thiếu CT">Thiếu CT</SelectItem>
                                <SelectItem value="Khác">Khác</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Nội dung <span className="text-red-500">*</span></Label>
                            <Textarea value={noteFormData.content} onChange={(e) => setNoteFormData({ ...noteFormData, content: e.target.value })} placeholder="Nhập nội dung ghi chú..." className="h-24" required />
                          </div>
                          <div className="flex items-end gap-3">
                            <div className="flex-1 space-y-2">
                              <Label>Mail đến NV (Tùy chọn)</Label>
                              <Input value={noteFormData.mail_to_nv} onChange={(e) => setNoteFormData({ ...noteFormData, mail_to_nv: e.target.value })} placeholder="Nhập tên nhân viên..." />
                            </div>
                            <Button onClick={handleNoteSubmit} className="bg-green-600 hover:bg-green-700 h-10" disabled={!noteFormData.content.trim()}>Gửi</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardTitle>
                <CardDescription><p>Dấu (*) TS đã được nhắn hơn một lần trong tuần</p></CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20 px-1">Phòng</TableHead>
                      <TableHead className="w-14 px-2">Năm</TableHead>
                      <TableHead className="px-2">Danh sách Mã TS</TableHead>
                      <TableHead className="w-32 px-1 text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedRows.length > 0 ? groupedRows.map((row: any) => (
                      <TableRow key={row.id}>
                        {row.isFullWidth ? (
                          <TableCell colSpan={3} className="font-bold text-lg px-2 whitespace-pre-wrap">{row.room}</TableCell>
                        ) : (
                          <>
                            <TableCell className="font-bold text-lg px-1">{row.room}</TableCell>
                            <TableCell className="font-bold text-lg px-1">{row.year}</TableCell>
                            <TableCell className="font-bold text-lg px-2">{row.codes}</TableCell>
                          </>
                        )}
                        <TableCell className="px-1 text-right">
                          {row.isNote && canManageDailyReport && (
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => handleEditNote(row.noteData)} className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Chỉnh sửa ghi chú">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteNote(row.noteData.id)} className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Xóa ghi chú">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" onClick={() => handleNoteDone(row.noteData.id)} className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white" title="Đánh dấu đã xử lý">
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={4} className="text-center h-24">Không có dữ liệu để gom nhóm.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800">Danh sách tài sản cần lấy ({filteredTransactions.length} bản ghi)</CardTitle>
              <CardDescription><span suppressHydrationWarning>{headerDateDisplay}</span></CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">STT</TableHead>
                      {canSeeTakenColumn && <TableHead className="w-16">Đã lấy</TableHead>}
                      <TableHead>Phòng</TableHead>
                      <TableHead>Năm TS</TableHead>
                      <TableHead>Mã TS</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Buổi</TableHead>
                      <TableHead>Ghi chú</TableHead>
                      <TableHead>CB</TableHead>
                      <TableHead>Time nhắn</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTransactions.map((t, idx) => {
                      const stt = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                      return (
                        <TableRow key={t.id}>
                          <TableCell>{stt}</TableCell>
                          {canSeeTakenColumn && (
                            <TableCell>
                              <Switch
                                checked={takenTransactionIds.has(t.id)}
                                onCheckedChange={() => handleToggleTakenStatus(t.id)}
                                className="data-[state=checked]:bg-green-600"
                              />
                            </TableCell>
                          )}
                          <TableCell>{t.room}</TableCell>
                          <TableCell>{t.asset_year}</TableCell>
                          <TableCell>{t.asset_code}</TableCell>
                          <TableCell>{t.transaction_type}</TableCell>
                          <TableCell>{t.transaction_date}</TableCell>
                          <TableCell>{t.parts_day}</TableCell>
                          <TableCell>{t.note || "-"}</TableCell>
                          <TableCell>{t.staff_code}</TableCell>
                          <TableCell>{formatGmt7TimeNhan(t.notified_at)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" title="Chỉnh sửa" onClick={() => handleEditTransaction(t)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" title="Xóa" onClick={() => handleDeleteTransaction(t.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {paginatedTransactions.length === 0 && (
                      <TableRow><TableCell colSpan={canSeeTakenColumn ? 12 : 11} className="text-center h-20">Không có dữ liệu.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {filteredDeletedTransactions.length > 0 && (
            <Card className="border-0 shadow-xl shadow-slate-100/50 mt-6">
              <CardHeader className="bg-gradient-to-r from-rose-50 to-rose-100 border-b border-rose-200">
                <CardTitle className="text-lg font-semibold text-rose-800">Danh sách tài sản đã xóa ({filteredDeletedTransactions.length} bản ghi)</CardTitle>
                <CardDescription>Chỉ Admin có thể sửa/xóa trong danh sách này</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">STT</TableHead>
                        <TableHead>Phòng</TableHead>
                        <TableHead>Năm TS</TableHead>
                        <TableHead>Mã TS</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead>Ngày</TableHead>
                        <TableHead>Buổi</TableHead>
                        <TableHead>Ghi chú</TableHead>
                        <TableHead>CB</TableHead>
                        <TableHead>Time nhắn</TableHead>
                        <TableHead>Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeletedTransactions.map((t, idx) => (
                        <TableRow key={t.id}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{t.room}</TableCell>
                          <TableCell>{t.asset_year}</TableCell>
                          <TableCell>{t.asset_code}</TableCell>
                          <TableCell>{t.transaction_type}</TableCell>
                          <TableCell>{t.transaction_date}</TableCell>
                          <TableCell>{t.parts_day}</TableCell>
                          <TableCell>{t.note || "-"}</TableCell>
                          <TableCell>{t.staff_code}</TableCell>
                          <TableCell>{formatGmt7TimeNhan(t.notified_at)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" title="Chỉnh sửa" onClick={() => handleEditTransaction(t)} disabled={!isAdmin}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" title="Xóa vĩnh viễn" onClick={() => handleDeleteTransaction(t.id)} disabled={!isAdmin}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {filteredTransactions.length > ITEMS_PER_PAGE && (
        <div className="flex justify-center items-center gap-4 mt-6 no-print">
          <Button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} variant="outline" className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm">
            <ChevronLeft className="w-4 h-4 mr-2" /> Trước
          </Button>
          <span className="text-slate-700 font-medium">Trang {currentPage} trên {totalPages}</span>
          <Button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} variant="outline" className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm">
            Tiếp <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      <Dialog open={isEditNoteDialogOpen} onOpenChange={setIsEditNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Chỉnh sửa ghi chú</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Phòng</Label>
              <Select value={editNoteFormData.room} onValueChange={(v) => setEditNoteFormData({ ...editNoteFormData, room: v })}>
                <SelectTrigger><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QLN">QLN</SelectItem>
                  <SelectItem value="CMT8">CMT8</SelectItem>
                  <SelectItem value="NS">NS</SelectItem>
                  <SelectItem value="ĐS">ĐS</SelectItem>
                  <SelectItem value="LĐH">LĐH</SelectItem>
                  <SelectItem value="NQ">NQ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loại tác nghiệp</Label>
              <Select value={editNoteFormData.operation_type} onValueChange={(v) => setEditNoteFormData({ ...editNoteFormData, operation_type: v })}>
                <SelectTrigger><SelectValue placeholder="Chọn loại tác nghiệp" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hoàn trả">Hoàn trả</SelectItem>
                  <SelectItem value="Xuất kho">Xuất kho</SelectItem>
                  <SelectItem value="Nhập kho">Nhập kho</SelectItem>
                  <SelectItem value="Xuất mượn">Xuất mượn</SelectItem>
                  <SelectItem value="Thiếu CT">Thiếu CT</SelectItem>
                  <SelectItem value="Khác">Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nội dung</Label>
              <Textarea value={editNoteFormData.content} onChange={(e) => setEditNoteFormData({ ...editNoteFormData, content: e.target.value })} placeholder="Nhập nội dung ghi chú..." className="h-24" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditNoteDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleUpdateNote} className="bg-blue-600 hover:bg-blue-700">Cập nhật</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Chỉnh sửa giao dịch</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Ngày giao dịch</Label>
              <Input type="date" value={editFormData.transaction_date || ""} onChange={(e) => setEditFormData({ ...editFormData, transaction_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Buổi</Label>
              <Select value={editFormData.parts_day || ""} onValueChange={(v) => setEditFormData({ ...editFormData, parts_day: v })}>
                <SelectTrigger><SelectValue placeholder="Chọn buổi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sáng">Sáng</SelectItem>
                  <SelectItem value="Chiều">Chiều</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phòng</Label>
              <Select value={editFormData.room || ""} onValueChange={(v) => setEditFormData({ ...editFormData, room: v })}>
                <SelectTrigger><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QLN">QLN</SelectItem>
                  <SelectItem value="CMT8">CMT8</SelectItem>
                  <SelectItem value="NS">NS</SelectItem>
                  <SelectItem value="ĐS">ĐS</SelectItem>
                  <SelectItem value="LĐH">LĐH</SelectItem>
                  <SelectItem value="DVKH">DVKH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loại tác nghiệp</Label>
              <Select value={editFormData.transaction_type || ""} onValueChange={(v) => setEditFormData({ ...editFormData, transaction_type: v })}>
                <SelectTrigger><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Xuất kho">Xuất kho</SelectItem>
                  <SelectItem value="Mượn TS">Mượn TS</SelectItem>
                  <SelectItem value="Thay bìa">Thay bìa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Năm TS</Label>
              <Input type="number" value={editFormData.asset_year || ""} onChange={(e) => setEditFormData({ ...editFormData, asset_year: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Mã TS</Label>
              <Input type="number" value={editFormData.asset_code || ""} onChange={(e) => setEditFormData({ ...editFormData, asset_code: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Ghi chú</Label>
              <Textarea value={editFormData.note || ""} onChange={(e) => setEditFormData({ ...editFormData, note: e.target.value })} placeholder="Nhập ghi chú..." />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleUpdateTransaction} className="bg-blue-600 hover:bg-blue-700">Cập nhật</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}