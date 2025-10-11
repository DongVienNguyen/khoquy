"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, addDays, startOfWeek, endOfWeek, isWithinInterval, getWeek, getYear } from "date-fns";
import { useRouter } from "next/navigation";
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
import { FileText, Calendar as CalendarIcon, Filter, ListTree, ChevronLeft, ChevronRight, Plus, CheckCircle, Edit, Trash2, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";
import AssetEntryInlineForm from "@/components/asset-entry/AssetEntryInlineForm";
import { edgeInvoke, friendlyErrorMessage } from "@/lib/edge-invoke";

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
  const [isAssetEntryDialogOpen, setIsAssetEntryDialogOpen] = useState(false);

  const isFetchingDataRef = useRef(false);
  useEffect(() => { isFetchingDataRef.current = isFetchingData; }, [isFetchingData]);

  const canManageDailyReportRef = useRef(false);
  useEffect(() => { canManageDailyReportRef.current = !!(currentStaff?.department === "NQ"); }, [currentStaff]);

  const canSeeTakenColumnRef = useRef(false);
  useEffect(() => { canSeeTakenColumnRef.current = !!(currentStaff?.department === "NQ"); }, [currentStaff]);

  const currentUsernameRef = useRef<string | undefined>(undefined);
  useEffect(() => { currentUsernameRef.current = currentStaff?.username; }, [currentStaff]);

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
    const res = await edgeInvoke<ProcessedNote[]>("asset-transactions", { action: "list_notes" });
    if (!res.ok) return;
    setProcessedNotes(Array.isArray(res.data) ? (res.data as ProcessedNote[]) : []);
  }, []);

  const loadTakenStatus = useCallback(async () => {
    if (!currentStaff?.username || !canSeeTakenColumn) {
      setTakenTransactionIds(new Set());
      return;
    }
    const week = getCurrentWeekYear();
    const res = await edgeInvoke<any[]>("asset-transactions", { action: "list_taken_status", user_username: currentStaff.username, week_year: week });
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
      const res = await edgeInvoke<AssetTx[]>("asset-transactions", { action: "list_range", start: range.start, end: range.end, parts_day: null, include_deleted: true });
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
  }, []);

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
      const resTx = await edgeInvoke<AssetTx[]>("asset-transactions", { action: "list_range", start: range.start, end: range.end, parts_day: null, include_deleted: true });

      const doNotes = canManageDailyReportRef.current;
      const doTaken = canSeeTakenColumnRef.current && !!currentUsernameRef.current;

      const resNotes = doNotes ? await edgeInvoke<ProcessedNote[]>("asset-transactions", { action: "list_notes" }) : { ok: false, data: [] as any };
      const resTaken = doTaken
        ? await edgeInvoke<any[]>("asset-transactions", { action: "list_taken_status", user_username: currentUsernameRef.current!, week_year: getCurrentWeekYear() })
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
  }, [autoRefresh]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, customFilters]);

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

    return filtered.filter((t) => !t.is_deleted).sort((a, b) => {
      if (a.room !== b.room) return a.room.localeCompare(b.room);
      if (a.asset_year !== b.asset_year) return a.asset_year - b.asset_year;
      return (a.asset_code || 0) - (b.asset_code || 0);
    });
  }, [allTransactions, filterType, customFilters]);

  const filteredDeletedTransactions = useMemo(() => {
    const transactions = (allTransactions || []).filter(Boolean);
    if (transactions.length === 0) return [];
    let base: AssetTx[] = [];
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

  const startOfCurrentWeek = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const endOfCurrentWeek = useMemo(() => endOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const groupedRows = useMemo(() => {
    const txs = filteredTransactions;
    const notes = processedNotes;
    if (!showGrouped && !(canManageDailyReport && notes.length > 0)) return [];

    const freq = new Map<string, number>();
    (allTransactions || []).forEach((t) => {
      const dt = new Date(t.transaction_date);
      if (isWithinInterval(dt, { start: startOfCurrentWeek, end: endOfCurrentWeek })) {
        const key = `${t.room}-${t.asset_year}-${t.asset_code}`;
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    });

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
    const res = await edgeInvoke<any>("asset-transactions", {
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
    const res = await edgeInvoke<any>("asset-transactions", {
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
      const res = await edgeInvoke<any>("asset-transactions", { action: "hard_delete_transaction", id: transactionId });
      if (!res.ok) {
        toast.error("Lỗi khi xóa giao dịch. Vui lòng thử lại.");
        return;
      }
    } else {
      const res = await edgeInvoke<any>("asset-transactions", { action: "soft_delete", id: transactionId, deleted_by: currentStaff?.username || "unknown" });
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
    const res = await edgeInvoke<any>("asset-transactions", {
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
    const res = await edgeInvoke<any>("asset-transactions", {
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
    const res = await edgeInvoke<any>("asset-transactions", { action: "delete_note", id: noteId });
    if (!res.ok) {
      toast.error("Lỗi khi xóa ghi chú.");
      return;
    }
    toast.success("Đã xóa ghi chú");
    loadProcessedNotes();
  }, [canManageDailyReport, loadProcessedNotes]);

  const handleNoteDone = useCallback(async (noteId: string) => {
    if (!canManageDailyReport) return;
    const res = await edgeInvoke<any>("asset-transactions", { action: "mark_note_done", id: noteId });
    if (!res.ok) {
      toast.error("Lỗi khi đánh dấu ghi chú đã xong.");
      return;
    }
    toast.success("Đã đánh dấu ghi chú đã xử lý");
    loadProcessedNotes();
  }, [canManageDailyReport, loadProcessedNotes]);

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
    const sWeek = format(startOfCurrentWeek, "II");
    const sYear = format(startOfCurrentWeek, "yyyy");
    return `Tuần ${sWeek} - ${sYear} (${format(startOfCurrentWeek, "dd/MM")} - ${format(endOfCurrentWeek, "dd/MM")})`;
  }, [startOfCurrentWeek, endOfCurrentWeek]);

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
    <div className="p-4 md:p-8 space-y-6">
      <SonnerToaster />

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-green-600 to-green-700 rounded-xl flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Báo cáo trong ngày</h1>
            <p className="text-slate-600">Xem và xử lý thông báo tài sản</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 pr-3 border-r">
            <span className="text-sm text-slate-600">Tự làm mới</span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          <div className="text-xs text-slate-500 px-2">
            Lần cập nhật: {lastRefreshTime ? format(lastRefreshTime, "HH:mm:ss dd/MM") : "-"}
          </div>
          <Button
            variant="outline"
            onClick={() => loadAllTransactions(false, true)}
            className="bg-white hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isManualRefreshing ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
          <Button
            onClick={exportFilteredCSV}
            disabled={isLoading}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Xuất CSV
          </Button>
          <div className="flex items-center gap-2 pl-3 border-l">
            <span className="text-sm text-slate-600">Nhóm theo phòng</span>
            <Switch checked={showGrouped} onCheckedChange={setShowGrouped} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bộ lọc</CardTitle>
          <CardDescription className="text-xs">
            Chọn nhanh theo ca/ngày hoặc tuỳ chọn khoảng ngày
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            className="grid grid-cols-2 md:grid-cols-6 gap-2"
            value={filterType}
            onValueChange={setFilterType}
          >
            <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <RadioGroupItem value="morning" id="flt-morning" />
              <span>Sáng hôm nay</span>
            </label>
            <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <RadioGroupItem value="afternoon" id="flt-afternoon" />
              <span>Chiều hôm nay</span>
            </label>
            <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <RadioGroupItem value="today" id="flt-today" />
              <span>Trong ngày</span>
            </label>
            <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <RadioGroupItem value="next_day" id="flt-next" />
              <span>Ngày kế</span>
            </label>
            <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <RadioGroupItem value="qln_pgd_next_day" id="flt-qlnpgd" />
              <span>QLN sáng & PGD</span>
            </label>
            <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <RadioGroupItem value="custom" id="flt-custom" />
              <span>Tùy chọn</span>
            </label>
          </RadioGroup>

          {filterType === "custom" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Từ: {format(new Date(customFilters.start), "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <Calendar
                    mode="single"
                    selected={new Date(customFilters.start)}
                    onSelect={(date) => {
                      if (!date) return;
                      const iso = format(date, "yyyy-MM-dd");
                      setCustomFilters((p) => ({ ...p, start: iso }));
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Đến: {format(new Date(customFilters.end), "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <Calendar
                    mode="single"
                    selected={new Date(customFilters.end)}
                    onSelect={(date) => {
                      if (!date) return;
                      const iso = format(date, "yyyy-MM-dd");
                      setCustomFilters((p) => ({ ...p, end: iso }));
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Select
                value={customFilters.parts_day}
                onValueChange={(v: "all" | "Sáng" | "Chiều") => setCustomFilters((p) => ({ ...p, parts_day: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Buổi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cả ngày</SelectItem>
                  <SelectItem value="Sáng">Sáng</SelectItem>
                  <SelectItem value="Chiều">Chiều</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFilterType("morning")}>Sáng</Button>
            <Button variant="outline" onClick={() => setFilterType("afternoon")}>Chiều</Button>
            <Button variant="outline" onClick={() => setFilterType("today")}>Hôm nay</Button>
            <Button variant="outline" onClick={() => setFilterType("next_day")}>Ngày kế</Button>
            <Button variant="outline" onClick={() => setFilterType("qln_pgd_next_day")}>QLN & PGD</Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="text-sm text-slate-600">
          Hiển thị: {paginatedTransactions.length}/{filteredTransactions.length} mục
        </div>
        <div className="flex gap-2">
          <Dialog open={isAssetEntryDialogOpen} onOpenChange={setIsAssetEntryDialogOpen}>
            <Button onClick={() => setIsAssetEntryDialogOpen(true)} className="bg-green-600 hover:bg-green-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Nhập nhanh
            </Button>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Nhập nhanh thông báo TS</DialogTitle>
              </DialogHeader>
              <AssetEntryInlineForm />
            </DialogContent>
          </Dialog>

          {canManageDailyReport && (
            <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
              <Button variant="outline" onClick={() => setIsNotesDialogOpen(true)}>
                <ListTree className="w-4 h-4 mr-2" />
                Thêm ghi chú
              </Button>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Thêm ghi chú</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Phòng</Label>
                    <Select
                      value={noteFormData.room}
                      onValueChange={(v) => setNoteFormData((p) => ({ ...p, room: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                      <SelectContent>
                        {ROOMS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Loại</Label>
                    <Select
                      value={noteFormData.operation_type}
                      onValueChange={(v) => setNoteFormData((p) => ({ ...p, operation_type: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Chọn loại" /></SelectTrigger>
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
                  <div className="sm:col-span-2 space-y-1">
                    <Label>Nội dung</Label>
                    <Textarea
                      rows={3}
                      value={noteFormData.content}
                      onChange={(e) => setNoteFormData((p) => ({ ...p, content: e.target.value }))}
                      placeholder="Nhập nội dung ghi chú..."
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label>Email người nhận (tùy chọn)</Label>
                    <Input
                      value={noteFormData.mail_to_nv}
                      onChange={(e) => setNoteFormData((p) => ({ ...p, mail_to_nv: e.target.value }))}
                      placeholder="ví dụ: user@example.com"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsNotesDialogOpen(false)}>Hủy</Button>
                  <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleNoteSubmit}>
                    Lưu ghi chú
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Table */}
      <Card id="main-content-section" className="border-0 shadow-xl shadow-slate-100/50">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
          <CardTitle className="text-lg font-semibold text-slate-800">
            Danh sách ({filteredTransactions.length})
          </CardTitle>
          <CardDescription>
            Bộ lọc: {(() => {
              switch (filterType) {
                case "morning": return `Sáng (${format(getMorningTargetDate(), "dd/MM/yyyy")})`;
                case "afternoon": return `Chiều (${format(new Date(), "dd/MM/yyyy")})`;
                case "today": return `Trong ngày (${format(new Date(), "dd/MM/yyyy")})`;
                case "next_day": return `Ngày kế (${format(getNextWorkingDay(new Date()), "dd/MM/yyyy")})`;
                case "qln_pgd_next_day": return `QLN Sáng & PGD (${format(getMorningTargetDate(), "dd/MM/yyyy")})`;
                case "custom": {
                  const s = format(new Date(customFilters.start), "dd/MM/yyyy");
                  const e = format(new Date(customFilters.end), "dd/MM/yyyy");
                  const p = customFilters.parts_day === "all" ? "" : ` (${customFilters.parts_day})`;
                  return `Từ ${s} đến ${e}${p}`;
                }
                default: return "-";
              }
            })()}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>Phòng</TableHead>
                  <TableHead>Năm</TableHead>
                  <TableHead>Mã TS</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Buổi</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead>CB</TableHead>
                  <TableHead>Time nhắn</TableHead>
                  <TableHead>Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-slate-600">Đang tải dữ liệu...</TableCell>
                  </TableRow>
                ) : paginatedTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-slate-600">Không có dữ liệu.</TableCell>
                  </TableRow>
                ) : (
                  paginatedTransactions.map((t, idx) => {
                    const stt = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                    const allowed = t.is_deleted ? isAdmin : canActOnTransaction(t);
                    const taken = takenTransactionIds.has(t.id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell>{stt}</TableCell>
                        <TableCell>{t.room}</TableCell>
                        <TableCell>{t.asset_year}</TableCell>
                        <TableCell>{t.asset_code}</TableCell>
                        <TableCell>{t.transaction_type}</TableCell>
                        <TableCell>{format(new Date(t.transaction_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{t.parts_day || "-"}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={t.note || ""}>{t.note || "-"}</TableCell>
                        <TableCell>{t.staff_code || "-"}</TableCell>
                        <TableCell>{formatGmt7TimeNhan(t.notified_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {canSeeTakenColumn && (
                              <Button
                                variant={taken ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleToggleTakenStatus(t.id)}
                                className={taken ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                                title={taken ? "Đã cắt bìa" : "Đánh dấu đã cắt bìa"}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                {taken ? "Đã cắt" : "Cắt bìa"}
                              </Button>
                            )}
                            <Button variant="outline" size="icon" disabled={!allowed} onClick={() => handleEditTransaction(t)} title="Sửa">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" disabled={!allowed} onClick={() => handleDeleteTransaction(t.id)} title="Xóa">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {filteredTransactions.length > ITEMS_PER_PAGE && (
        <div className="flex justify-center items-center gap-4">
          <Button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            variant="outline"
            className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Trước
          </Button>
          <span className="text-slate-700 font-medium">
            Trang {currentPage} / {Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)}
          </span>
          <Button
            onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE), p + 1))}
            disabled={currentPage >= Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)}
            variant="outline"
            className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm"
          >
            Tiếp <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Grouped summary */}
      {showGrouped && (
        <Card className="border-0 shadow-xl shadow-slate-100/50">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-base">Tổng hợp theo phòng/năm (tuần hiện tại)</CardTitle>
            <CardDescription>{todayText}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {groupedRows.length === 0 ? (
              <div className="py-6 text-center text-slate-600">Không có dữ liệu tổng hợp.</div>
            ) : (
              groupedRows.map((row: any) => {
                if (row.isNote) {
                  return (
                    <div key={row.id} className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-slate-800">{row.room}</div>
                        {canManageDailyReport && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditNote(row.noteData)}>
                              <Edit className="w-4 h-4 mr-1" /> Sửa
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleNoteDone(row.noteData.id)}>
                              <CheckCircle className="w-4 h-4 mr-1" /> Đã xong
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDeleteNote(row.noteData.id)}>
                              <Trash2 className="w-4 h-4 mr-1" /> Xóa
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={row.id} className="py-3 grid grid-cols-3 md:grid-cols-6 gap-2 items-center">
                    <div className="col-span-2 md:col-span-1 font-semibold">{row.room}</div>
                    <div className="font-medium">Năm: {row.year}</div>
                    <div className="md:col-span-4 truncate" title={row.codes}>
                      <span className="text-slate-700">{row.codes}</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit transaction dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa giao dịch</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ngày</Label>
              <Input
                type="date"
                value={editFormData.transaction_date || ""}
                onChange={(e) => setEditFormData((p: any) => ({ ...p, transaction_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Buổi</Label>
              <Select
                value={editFormData.parts_day || ""}
                onValueChange={(v) => setEditFormData((p: any) => ({ ...p, parts_day: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Chọn buổi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sáng">Sáng</SelectItem>
                  <SelectItem value="Chiều">Chiều</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Phòng</Label>
              <Select
                value={editFormData.room || ""}
                onValueChange={(v) => setEditFormData((p: any) => ({ ...p, room: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                <SelectContent>
                  {ROOMS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Loại</Label>
              <Select
                value={editFormData.transaction_type || ""}
                onValueChange={(v) => setEditFormData((p: any) => ({ ...p, transaction_type: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Xuất kho">Xuất kho</SelectItem>
                  <SelectItem value="Mượn TS">Mượn TS</SelectItem>
                  <SelectItem value="Thay bìa">Thay bìa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Năm TS</Label>
              <Input
                type="number"
                value={editFormData.asset_year ?? ""}
                onChange={(e) => setEditFormData((p: any) => ({ ...p, asset_year: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Mã TS</Label>
              <Input
                type="number"
                value={editFormData.asset_code ?? ""}
                onChange={(e) => setEditFormData((p: any) => ({ ...p, asset_code: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Ghi chú</Label>
              <Textarea
                rows={3}
                value={editFormData.note ?? ""}
                onChange={(e) => setEditFormData((p: any) => ({ ...p, note: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Hủy</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleUpdateTransaction}>
              Lưu
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}