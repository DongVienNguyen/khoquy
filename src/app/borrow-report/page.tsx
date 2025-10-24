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
import { BarChart3, Download, Calendar as CalendarIcon, Filter, FileUp, ChevronLeft, ChevronRight, Loader2, RefreshCcw } from "lucide-react";
import { SonnerToaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { edgeInvoke, friendlyErrorMessage } from "@/lib/edge-invoke";
import OpenBorrowsAutoRefresh from "@/components/management/OpenBorrowsAutoRefresh";

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

// (Thêm) Kiểu dữ liệu sau tiền xử lý (open borrows)
type OpenBorrow = {
  room: string;
  asset_year: number;
  asset_code: number;
  transaction_date: string; // last_borrow_date
  parts_day: "Sáng" | "Chiều" | null;
  note: string | null;
  staff_code: string | null; // latest
  staff_codes: string[] | null; // unique since last export
  transaction_count: number;
};

const ITEMS_PER_PAGE = 30;

export default function BorrowReportPage() {
  const [allTransactions, setAllTransactions] = useState<AssetTx[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // (Thêm) Dữ liệu đã tổng hợp từ view
  const [openBorrows, setOpenBorrows] = useState<OpenBorrow[]>([]);

  // (Thêm) Lưu thời điểm refresh gần nhất
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

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
  // (Thêm) Bộ lọc Buổi
  const [selectedPartsDay, setSelectedPartsDay] = useState<"all" | "Sáng" | "Chiều">("all");

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
      // (Thêm) Khôi phục Buổi
      if (s?.selectedPartsDay) setSelectedPartsDay(s.selectedPartsDay);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "borrow_report_filters_v1",
      JSON.stringify({ dateRange, selectedRoom, assetYearFilter, assetCodeFilter, staffCodeFilter, searchTerm, sortKey, sortDirection, selectedPartsDay })
    );
  }, [dateRange, selectedRoom, assetYearFilter, assetCodeFilter, staffCodeFilter, searchTerm, sortKey, sortDirection, selectedPartsDay]);

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

  // (Thêm) Hàm gọi refresh thủ công
  const manualRefresh = useCallback(async () => {
    try {
      toast.info("Đang làm mới dữ liệu báo cáo...");
      // GỌI EDGE FUNCTION refresh-open-borrows
      const res = await edgeInvoke<{ last_refresh: string }>("refresh-open-borrows", {});
      const ts = res?.data?.last_refresh ? new Date(res.data.last_refresh) : null;
      if (ts) setLastRefreshTime(ts);
      toast.success(ts ? `Đã làm mới lúc ${format(ts, "dd/MM/yyyy HH:mm")}` : "Đã làm mới dữ liệu.");
      // Sau refresh, tải lại danh sách
      await loadOpenBorrows();
    } catch (e: any) {
      toast.error(friendlyErrorMessage(e?.error));
    }
  }, []);

  // (Thêm) Tải danh sách từ view theo khoảng ngày
  const loadOpenBorrows = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await edgeInvoke<OpenBorrow[]>("asset-transactions", {
        action: "list_open_borrows",
        start: dateRange.start,
        end: dateRange.end,
        room: selectedRoom !== "all" ? selectedRoom : null,
        parts_day: selectedPartsDay !== "all" ? selectedPartsDay : null,
      });
      const list: OpenBorrow[] = Array.isArray(res.data) ? (res.data as OpenBorrow[]) : [];
      setOpenBorrows(list);
    } catch (e: any) {
      setOpenBorrows([]);
      toast.error(friendlyErrorMessage(e?.error));
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.start, dateRange.end, selectedRoom, selectedPartsDay]);

  // (Thêm) Auto-refresh nếu dữ liệu cũ hơn 4 giờ, sau đó tải danh sách
  useEffect(() => {
    let cancelled = false;

    const checkAndRefresh = async () => {
      try {
        const res = await edgeInvoke<string | null>("asset-transactions", { action: "get_open_borrows_last_refresh" });
        const last = res?.data ? new Date(String(res.data)) : null;
        if (last) setLastRefreshTime(last);
        const now = new Date();
        const fourHoursMs = 4 * 60 * 60 * 1000;

        if (!last || now.getTime() - last.getTime() > fourHoursMs) {
          // QUÁ 4 GIỜ → GỌI EDGE FUNCTION refresh-open-borrows
          await edgeInvoke("refresh-open-borrows", {});
        }
      } catch {
        // Bỏ qua lỗi kiểm tra refresh để không cản trở tải danh sách
      } finally {
        if (!cancelled) {
          loadOpenBorrows();
        }
      }
    };

    checkAndRefresh();

    return () => { cancelled = true; };
  }, [loadOpenBorrows]);

  // Reset trang khi filter thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, selectedRoom, selectedPartsDay, assetYearFilter, assetCodeFilter, staffCodeFilter, debouncedSearch, sortKey, sortDirection]);

  // (Sửa) Lọc & gom nhóm giờ dựa trên openBorrows đã tiền xử lý
  const filteredTransactions = useMemo(() => {
    if (!openBorrows.length) return [];

    const dateFiltered = openBorrows.filter((t) => {
      const dt = new Date(t.transaction_date);
      const startDate = new Date(dateRange.start + "T00:00:00");
      const endDate = new Date(dateRange.end + "T23:59:59");
      const okDate = dt >= startDate && dt <= endDate;
      const okRoom = selectedRoom === "all" || t.room === selectedRoom;
      return okDate && okRoom;
    });

    const advFiltered = dateFiltered.filter((t) => {
      const yearOk = assetYearFilter ? String(t.asset_year).trim() === String(assetYearFilter).trim() : true;
      const codeOk = assetCodeFilter ? String(t.asset_code).includes(String(assetCodeFilter).trim()) : true;
      const partsOk = selectedPartsDay === "all" ? true : (t.parts_day === selectedPartsDay);
      const staffOk = staffCodeFilter
        ? (
            (t.staff_code ? String(t.staff_code).toLowerCase().includes(staffCodeFilter.trim().toLowerCase()) : false) ||
            (Array.isArray(t.staff_codes) ? t.staff_codes.some((s) => String(s || "").toLowerCase().includes(staffCodeFilter.trim().toLowerCase())) : false)
          )
        : true;
      const s = debouncedSearch;
      const searchOk = s
        ? (
            String(t.room || "").toLowerCase().includes(s.toLowerCase()) ||
            String(t.asset_year || "").includes(s) ||
            String(t.asset_code || "").includes(s) ||
            (t.staff_code ? String(t.staff_code).toLowerCase().includes(s.toLowerCase()) : false) ||
            (Array.isArray(t.staff_codes) ? t.staff_codes.some((sc) => String(sc || "").toLowerCase().includes(s.toLowerCase())) : false) ||
            String(t.note || "").toLowerCase().includes(s.toLowerCase())
          )
        : true;
      return yearOk && codeOk && partsOk && staffOk && searchOk;
    });

    const arr = [...advFiltered];

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
      } else if (sortKey === "staff_code") {
        va = (a.staff_code ?? "").toString().toLowerCase();
        vb = (b.staff_code ?? "").toString().toLowerCase();
      } else {
        va = (va ?? "").toString().toLowerCase();
        vb = (vb ?? "").toString().toLowerCase();
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return arr;
  }, [openBorrows, dateRange, selectedRoom, selectedPartsDay, assetYearFilter, assetCodeFilter, staffCodeFilter, debouncedSearch, sortKey, sortDirection]);

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
    setSelectedPartsDay("all");
  }, []);

  // (Sửa) Export CSV dùng dữ liệu openBorrows đã tổng hợp
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
    a.download = `BaoCaoMuonTS_${format(new Date(dateRange.start), "yyyyMMdd")}-${format(new Date(dateRange.end), "yyyyMMdd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filteredTransactions, dateRange.start, dateRange.end]);

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
      <OpenBorrowsAutoRefresh />
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
              <p className="text-slate-500 text-sm">
                Cập nhật: {lastRefreshTime ? format(lastRefreshTime, "HH:mm:ss - dd/MM/yyyy") : "Chưa có"}
              </p>
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
            <Button
              onClick={manualRefresh}
              variant="outline"
              className="bg-white hover:bg-slate-50 border-slate-300 text-slate-700"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Làm mới dữ liệu
            </Button>
          </div>
        </div>

        {/* Bộ lọc thời gian */}
        <div className="mt-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full md:w-auto justify-start gap-2">
                <Filter className="w-4 h-4" />
                <span className="font-medium">Bộ lọc thời gian</span>
                <span className="text-xs text-slate-500">
                  ({format(new Date(dateRange.start), "dd/MM/yyyy")} - {format(new Date(dateRange.end), "dd/MM/yyyy")})
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[700px] max-w-[95vw] p-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4" /> Từ ngày
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          {format(new Date(dateRange.start), "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={new Date(dateRange.start)}
                          onSelect={(d) => {
                            if (!d) return;
                            const s = format(d, "yyyy-MM-dd");
                            setDateRange((prev) => {
                              const end = prev.end;
                              const sDate = new Date(s);
                              const eDate = new Date(end);
                              return { start: s, end: sDate > eDate ? s : end };
                            });
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4" /> Đến ngày
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          {format(new Date(dateRange.end), "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={new Date(dateRange.end)}
                          onSelect={(d) => {
                            if (!d) return;
                            const e = format(d, "yyyy-MM-dd");
                            setDateRange((prev) => {
                              const start = prev.start;
                              const sDate = new Date(start);
                              const eDate = new Date(e);
                              return { start: eDate < sDate ? e : start, end: e };
                            });
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="text-slate-700" onClick={() => setQuickRange("7d")}>7 ngày</Button>
                  <Button variant="secondary" className="text-slate-700" onClick={() => setQuickRange("30d")}>30 ngày</Button>
                  <Button variant="secondary" className="text-slate-700" onClick={() => setQuickRange("mtd")}>Tháng này</Button>
                  <Button variant="secondary" className="text-slate-700" onClick={() => setQuickRange("ytd")}>Năm nay</Button>
                  <Button variant="ghost" onClick={clearFilters}>Đặt lại</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* (Thêm) Thanh bộ lọc chi tiết */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label>Phòng</Label>
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn phòng..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="QLN">QLN</SelectItem>
                <SelectItem value="CMT8">CMT8</SelectItem>
                <SelectItem value="NS">NS</SelectItem>
                <SelectItem value="ĐS">ĐS</SelectItem>
                <SelectItem value="LĐH">LĐH</SelectItem>
                <SelectItem value="DVKH">DVKH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* (Thêm) Buổi */}
          <div className="space-y-1">
            <Label>Buổi</Label>
            <Select value={selectedPartsDay} onValueChange={(v) => setSelectedPartsDay(v as "all" | "Sáng" | "Chiều")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn buổi..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="Sáng">Sáng</SelectItem>
                <SelectItem value="Chiều">Chiều</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Năm TS</Label>
            <Input
              value={assetYearFilter}
              onChange={(e) => setAssetYearFilter(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              placeholder="vd: 24"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label>Mã TS</Label>
            <Input
              value={assetCodeFilter}
              onChange={(e) => setAssetCodeFilter(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="vd: 259"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label>CB</Label>
            <Input
              value={staffCodeFilter}
              onChange={(e) => setStaffCodeFilter(e.target.value)}
              placeholder="Mã NV (CB)"
            />
          </div>
          <div className="space-y-1">
            <Label>Tìm kiếm</Label>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm tổng hợp..."
            />
          </div>
        </div>
      </div>

      {/* Bộ lọc & danh sách như trước */}
      {/* ...giữ nguyên UI từ bản hiện có... */}

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