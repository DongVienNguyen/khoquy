"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Download, Calendar as CalendarIcon, Filter, FileUp, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { SonnerToaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";

// Kiểu dữ liệu từ DailyReport
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
};

// Gọi edge function asset-transactions giống DailyReport
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

const ITEMS_PER_PAGE = 30;

export default function BorrowReportPage() {
  const [allTransactions, setAllTransactions] = useState<AssetTx[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Bộ lọc thời gian
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => ({
    start: format(new Date(), "yyyy-MM-dd"),
    end: format(addDays(new Date(), 2), "yyyy-MM-dd"),
  }));

  // Bộ lọc nâng cao & tìm kiếm
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [assetYearFilter, setAssetYearFilter] = useState<string>("");
  const [assetCodeFilter, setAssetCodeFilter] = useState<string>("");
  const [staffCodeFilter, setStaffCodeFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  // Sắp xếp + phân trang
  const [sortKey, setSortKey] = useState<"room" | "asset_year" | "asset_code" | "transaction_date" | "staff_code">("room");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Lưu/khôi phục filter từ localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("borrow_report_filters_v1");
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s?.dateRange) setDateRange(s.dateRange);
      if (s?.selectedRoom) setSelectedRoom(s.selectedRoom);
      if (s?.assetYearFilter !== undefined) setAssetYearFilter(String(s.assetYearFilter));
      if (s?.assetCodeFilter !== undefined) setAssetCodeFilter(String(s.assetCodeFilter));
      if (s?.staffCodeFilter !== undefined) setStaffCodeFilter(String(s.staffCodeFilter));
      if (s?.searchTerm !== undefined) {
        setSearchTerm(String(s.searchTerm));
        setDebouncedSearch(String(s.searchTerm));
      }
      if (s?.sortKey) setSortKey(s.sortKey);
      if (s?.sortDirection) setSortDirection(s.sortDirection);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "borrow_report_filters_v1",
      JSON.stringify({ dateRange, selectedRoom, assetYearFilter, assetCodeFilter, staffCodeFilter, searchTerm, sortKey, sortDirection })
    );
  }, [dateRange, selectedRoom, assetYearFilter, assetCodeFilter, staffCodeFilter, searchTerm, sortKey, sortDirection]);

  // Ranges nhanh
  const setQuickRange = useCallback((type: "7d" | "30d" | "mtd" | "ytd") => {
    const now = new Date();
    const toISO = (d: Date) => format(d, "yyyy-MM-dd");
    if (type === "7d") {
      const start = addDays(now, -6);
      setDateRange({ start: toISO(start), end: toISO(now) });
    } else if (type === "30d") {
      const start = addDays(now, -29);
      setDateRange({ start: toISO(start), end: toISO(now) });
    } else if (type === "mtd") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateRange({ start: toISO(start), end: toISO(now) });
    } else if (type === "ytd") {
      const start = new Date(now.getFullYear(), 0, 1);
      setDateRange({ start: toISO(start), end: toISO(now) });
    }
  }, []);

  // Sắp xếp cột
  const handleSort = useCallback((key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }, [sortKey, sortDirection]);

  // Khoảng mở rộng để truy vấn
  const getExtendedRange = useCallback((startISO: string, endISO: string) => {
    const start = addDays(new Date(startISO), -60);
    const end = addDays(new Date(endISO), 60);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    };
  }, []);

  // Tải giao dịch theo khoảng mở rộng, có thể lọc room server-side (nếu chọn)
  useEffect(() => {
    let cancelled = false;
    let idleHandle: any;

    const load = async () => {
      setIsLoading(true);
      try {
        const { start, end } = getExtendedRange(dateRange.start, dateRange.end);
        // asset-transactions hỗ trợ list_range theo ngày, phần lọc room sẽ làm client-side
        const res = await callFunc({ action: "list_range", start, end, parts_day: null, include_deleted: false });
        if (!cancelled) {
          const list: AssetTx[] = Array.isArray(res.data) ? res.data as AssetTx[] : [];
          setAllTransactions(list);
        }
      } catch (e: any) {
        if (!cancelled) {
          setAllTransactions([]);
          toast.error("Không thể tải dữ liệu mượn tài sản.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const run = () => load();
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      // @ts-ignore
      idleHandle = window.requestIdleCallback(run, { timeout: 1000 });
    } else {
      idleHandle = setTimeout(run, 50);
    }

    return () => {
      if (typeof window !== "undefined" && "cancelIdleCallback" in window && idleHandle) {
        // @ts-ignore
        window.cancelIdleCallback(idleHandle);
      } else if (idleHandle) {
        clearTimeout(idleHandle);
      }
      cancelled = true;
    };
  }, [dateRange.start, dateRange.end, getExtendedRange]);

  // Reset trang khi filter thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, selectedRoom, assetYearFilter, assetCodeFilter, staffCodeFilter, debouncedSearch, sortKey, sortDirection]);

  // Lọc & gom nhóm
  const filteredTransactions = useMemo(() => {
    if (!allTransactions.length) return [];

    // Tập các tài sản đã "Xuất kho" trong khoảng mở rộng
    const exportedKeys = new Set<string>();
    for (const t of allTransactions) {
      if (t.transaction_type === "Xuất kho") {
        exportedKeys.add(`${t.room}-${t.asset_year}-${t.asset_code}`);
      }
    }

    // Giao dịch "Mượn TS" chưa "Xuất kho"
    const borrowed = allTransactions.filter((t) => {
      if (t.transaction_type !== "Mượn TS") return false;
      const key = `${t.room}-${t.asset_year}-${t.asset_code}`;
      return !exportedKeys.has(key);
    });

    // Lọc theo khoảng ngày chính xác + room
    const startDate = new Date(dateRange.start + "T00:00:00");
    const endDate = new Date(dateRange.end + "T23:59:59");
    const dateRoomFiltered = borrowed.filter((t) => {
      const dt = new Date(t.transaction_date);
      const okDate = dt >= startDate && dt <= endDate;
      const okRoom = selectedRoom === "all" || t.room === selectedRoom;
      return okDate && okRoom;
    });

    // Bộ lọc nâng cao & tìm kiếm
    const advFiltered = dateRoomFiltered.filter((t) => {
      const yearOk = assetYearFilter ? String(t.asset_year).trim() === String(assetYearFilter).trim() : true;
      const codeOk = assetCodeFilter ? String(t.asset_code).includes(String(assetCodeFilter).trim()) : true;
      const staffOk = staffCodeFilter ? String(t.staff_code || "").toLowerCase().includes(staffCodeFilter.trim().toLowerCase()) : true;
      const s = debouncedSearch;
      const searchOk = s
        ? (
          String(t.room || "").toLowerCase().includes(s.toLowerCase()) ||
          String(t.asset_year || "").includes(s) ||
          String(t.asset_code || "").includes(s) ||
          String(t.staff_code || "").toLowerCase().includes(s.toLowerCase()) ||
          String(t.note || "").toLowerCase().includes(s.toLowerCase())
        )
        : true;
      return yearOk && codeOk && staffOk && searchOk;
    });

    // Gom nhóm theo Room-Year-Code, giữ bản gần nhất, đếm số lần mượn trong khoảng
    const map = new Map<string, any>();
    for (const t of advFiltered) {
      const key = `${t.room}-${t.asset_year}-${t.asset_code}`;
      if (!map.has(key)) {
        map.set(key, {
          ...t,
          transaction_count: 1,
          staff_codes: t.staff_code ? [t.staff_code] : [],
        });
      } else {
        const ex = map.get(key);
        ex.transaction_count += 1;
        if (t.staff_code && !ex.staff_codes.includes(t.staff_code)) ex.staff_codes.push(t.staff_code);
        // Cập nhật bản gần nhất theo ngày
        if (new Date(t.transaction_date) > new Date(ex.transaction_date)) {
          ex.transaction_date = t.transaction_date;
          ex.parts_day = t.parts_day;
          ex.note = t.note;
          ex.staff_code = t.staff_code;
        }
      }
    }

    const arr = Array.from(map.values());

    // Sắp xếp
    const numericKeys = new Set(["asset_year", "asset_code"]);
    arr.sort((a: any, b: any) => {
      let va = a[sortKey as string];
      let vb = b[sortKey as string];
      if (numericKeys.has(sortKey)) {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      } else if (sortKey === "transaction_date") {
        va = new Date(va).getTime();
        vb = new Date(vb).getTime();
      } else {
        va = (va ?? "").toString().toLowerCase();
        vb = (vb ?? "").toString().toLowerCase();
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return arr;
  }, [allTransactions, dateRange, selectedRoom, assetYearFilter, assetCodeFilter, staffCodeFilter, debouncedSearch, sortKey, sortDirection]);

  const paginatedTransactions = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);

  const clearFilters = useCallback(() => {
    setDateRange({
      start: format(new Date(), "yyyy-MM-dd"),
      end: format(addDays(new Date(), 2), "yyyy-MM-dd"),
    });
    setSelectedRoom("all");
    setAssetYearFilter("");
    setAssetCodeFilter("");
    setStaffCodeFilter("");
    setSearchTerm("");
    setDebouncedSearch("");
    setSortKey("room");
    setSortDirection("asc");
  }, []);

  const exportToCSV = useCallback(() => {
    if (!filteredTransactions.length) {
      toast.info("Không có dữ liệu để xuất.");
      return;
    }
    const headers = ["STT", "Phòng", "Năm TS", "Mã TS", "Loại", "Ngày", "Buổi", "Ghi chú", "Số lần", "CB"];
    const rows: string[] = [headers.join(",")];
    filteredTransactions.forEach((t: any, idx: number) => {
      const vals = [
        idx + 1,
        t.room,
        t.asset_year,
        t.asset_code,
        "Mượn TS",
        format(new Date(t.transaction_date), "dd/MM/yyyy"),
        t.parts_day || "",
        t.note || "",
        `${t.transaction_count || 1}`,
        (t.staff_codes && t.staff_codes.join(" | ")) || t.staff_code || "",
      ];
      rows.push(vals.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([`\uFEFF${rows.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BaoCaoMuonTS_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filteredTransactions]);

  const exportToPDF = useCallback(() => {
    window.print();
  }, []);

  const sortableHead = (key: typeof sortKey, label: string) => {
    const active = sortKey === key;
    const arrow = active ? (sortDirection === "asc" ? "▲" : "▼") : "";
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={`text-left font-medium ${active ? "text-green-700" : "text-slate-700"} hover:text-green-700`}
        title="Sắp xếp"
      >
        {label} {arrow && <span className="text-xs ml-1">{arrow}</span>}
      </button>
    );
  };

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
            <div className="w-10 h-10 bg-gradient-to-r from-green-600 to-green-700 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Báo cáo tài sản đã mượn</h1>
              <p className="text-slate-600">TS cần cắt bìa kiểm tra hàng quý</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={exportToCSV}
              disabled={filteredTransactions.length === 0}
              variant="outline"
              className="bg-white hover:bg-green-50 border-green-600 text-green-700 shadow-lg shadow-green-500/10"
            >
              <FileUp className="w-4 h-4 mr-2" />
              Xuất Excel
            </Button>
            <Button
              onClick={exportToPDF}
              disabled={filteredTransactions.length === 0}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25"
            >
              <Download className="w-4 h-4 mr-2" />
              Xuất PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Hàng bộ lọc - chỉ giữ Bộ lọc thời gian + Bộ lọc nâng cao & Tìm kiếm */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
          {/* Bộ lọc thời gian */}
          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-green-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Bộ lọc thời gian
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    Từ ngày
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal h-12 border-slate-200 ${!dateRange.start ? "text-muted-foreground" : ""}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.start ? format(new Date(dateRange.start), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.start ? new Date(dateRange.start) : undefined}
                        onSelect={(date) => date && setDateRange({ ...dateRange, start: format(date, "yyyy-MM-dd") })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    Đến ngày
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal h-12 border-slate-200 ${!dateRange.end ? "text-muted-foreground" : ""}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.end ? format(new Date(dateRange.end), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.end ? new Date(dateRange.end) : undefined}
                        onSelect={(date) => date && setDateRange({ ...dateRange, end: format(date, "yyyy-MM-dd") })}
                        disabled={(date) =>
                          Boolean(dateRange.start) && new Date(date).setHours(0,0,0,0) < new Date(dateRange.start).setHours(0,0,0,0)
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Quick ranges + clear */}
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <Button variant="outline" onClick={() => setQuickRange("7d")}>7 ngày qua</Button>
                <Button variant="outline" onClick={() => setQuickRange("30d")}>30 ngày qua</Button>
                <Button variant="outline" onClick={() => setQuickRange("mtd")}>Tháng này</Button>
                <Button variant="outline" onClick={() => setQuickRange("ytd")}>Năm nay</Button>
                <div className="ml-auto">
                  <Button variant="ghost" onClick={clearFilters}>Xóa bộ lọc</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bộ lọc nâng cao & Tìm kiếm */}
          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-green-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800">Bộ lọc nâng cao & Tìm kiếm</CardTitle>
              <CardDescription>Nhập thêm điều kiện để thu hẹp kết quả</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Năm TS (vd: 24)</Label>
                  <Input
                    placeholder="vd: 24"
                    value={assetYearFilter}
                    onChange={(e) => setAssetYearFilter(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mã TS (vd: 259)</Label>
                  <Input
                    placeholder="vd: 259"
                    value={assetCodeFilter}
                    onChange={(e) => setAssetCodeFilter(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mã NV (CB)</Label>
                  <Input
                    placeholder="vd: dongnv"
                    value={staffCodeFilter}
                    onChange={(e) => setStaffCodeFilter(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tìm kiếm tổng hợp</Label>
                  <Input
                    placeholder="Tìm theo phòng, năm, mã, CB, ghi chú..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Chọn phòng (đưa vào phần nâng cao thay vì card riêng, vì yêu cầu bỏ card “Hiển thị theo phòng”) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <div className="space-y-1">
                  <Label>Phòng</Label>
                  <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Tất cả các phòng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả các phòng</SelectItem>
                      <SelectItem value="QLN">QLN</SelectItem>
                      <SelectItem value="CMT8">CMT8</SelectItem>
                      <SelectItem value="NS">NS</SelectItem>
                      <SelectItem value="ĐS">ĐS</SelectItem>
                      <SelectItem value="LĐH">LĐH</SelectItem>
                      <SelectItem value="DVKH">DVKH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Danh sách tài sản đã mượn */}
      <div id="print-section" className="mt-6">
        <Card className="border-0 shadow-xl shadow-slate-100/50">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-800">
              Danh sách tài sản đã mượn ({filteredTransactions.length} bản ghi)
            </CardTitle>
            <CardDescription>
              Khoảng: {format(new Date(dateRange.start), "dd/MM/yyyy")} - {format(new Date(dateRange.end), "dd/MM/yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">STT</TableHead>
                    <TableHead>{sortableHead("room", "Phòng")}</TableHead>
                    <TableHead>{sortableHead("asset_year", "Năm TS")}</TableHead>
                    <TableHead>{sortableHead("asset_code", "Mã TS")}</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>{sortableHead("transaction_date", "Ngày (gần nhất)")}</TableHead>
                    <TableHead>Buổi</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead>Số lần</TableHead>
                    <TableHead>{sortableHead("staff_code", "CB")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
                        <span className="inline-flex items-center gap-2 text-slate-600">
                          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải dữ liệu...
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : paginatedTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-slate-600">Không có dữ liệu.</TableCell>
                    </TableRow>
                  ) : (
                    paginatedTransactions.map((t: any, idx: number) => {
                      const stt = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                      return (
                        <TableRow key={`${t.room}-${t.asset_year}-${t.asset_code}`}>
                          <TableCell>{stt}</TableCell>
                          <TableCell>{t.room}</TableCell>
                          <TableCell>{t.asset_year}</TableCell>
                          <TableCell>{t.asset_code}</TableCell>
                          <TableCell>Mượn TS</TableCell>
                          <TableCell>{format(new Date(t.transaction_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{t.parts_day || "-"}</TableCell>
                          <TableCell>{t.note || "-"}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                              {t.transaction_count || 1}x
                            </span>
                          </TableCell>
                          <TableCell>{(t.staff_codes && t.staff_codes.join(" | ")) || t.staff_code || "-"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {filteredTransactions.length > ITEMS_PER_PAGE && (
          <div className="flex justify-center items-center gap-4 mt-6 no-print">
            <Button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              variant="outline"
              className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm"
            >
              <ChevronLeft className="w-4 h-4 mr-2" /> Trước
            </Button>
            <span className="text-slate-700 font-medium">Trang {currentPage} trên {totalPages}</span>
            <Button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              variant="outline"
              className="bg-white hover:bg-slate-50 text-slate-600 shadow-sm"
            >
              Tiếp <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}