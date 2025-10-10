"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Archive, Plus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OtherAssetListTable from "@/components/other-assets/OtherAssetListTable";
import OtherAssetCardList from "@/components/other-assets/OtherAssetCardList";
import OtherAssetFilters from "@/components/other-assets/OtherAssetFilters";
import Pagination from "@/components/common/Pagination";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { OtherAsset } from "@/entities/OtherAsset";
import OtherAssetAPI from "@/entities/OtherAsset";
import OtherAssetHistoryAPI, { OtherAssetHistory } from "@/entities/OtherAssetHistory";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";

type Staff = {
  username: string;
  email?: string | null;
  role: "admin" | "user";
  department: string;
};

function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function OtherAssetsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Staff | null>(null);
  const [assets, setAssets] = useState<OtherAsset[]>([]);
  const [assetHistory, setAssetHistory] = useState<OtherAssetHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingAsset, setEditingAsset] = useState<OtherAsset | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedAssetHistory, setSelectedAssetHistory] = useState<OtherAssetHistory[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [changeReason, setChangeReason] = useState("");

  const [newAsset, setNewAsset] = useState<Partial<OtherAsset>>({
    name: "",
    deposit_date: format(new Date(), "yyyy-MM-dd"),
    depositor: "",
    deposit_receiver: "",
    withdrawal_date: "",
    withdrawal_deliverer: "",
    withdrawal_receiver: "",
    notes: ""
  });

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Filters / sort / pagination
  const [filtersIn, setFiltersIn] = useState({ depositStart: "", depositEnd: "", depositor: "" });
  const [filtersOut, setFiltersOut] = useState({ withdrawStart: "", withdrawEnd: "", withdrawPerson: "" });
  const [sortInKey, setSortInKey] = useState("deposit_date");
  const [sortInDir, setSortInDir] = useState<"asc" | "desc">("desc");
  const [sortOutKey, setSortOutKey] = useState("withdrawal_date");
  const [sortOutDir, setSortOutDir] = useState<"asc" | "desc">("desc");
  const [pageIn, setPageIn] = useState(1);
  const [pageOut, setPageOut] = useState(1);
  const PAGE_SIZE = 20;

  // Permission guard
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("loggedInStaff") : null;
    const s = raw ? JSON.parse(raw) as Staff : null;
    if (!s || (s.department !== "NQ" && s.role !== "admin")) {
      router.replace("/asset-entry");
      return;
    }
    setCurrentUser(s);
  }, [router]);

  // load data
  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      try {
        const [a, h] = await Promise.all([
          OtherAssetAPI.list("-created_date"),
          (currentUser?.role === "admin" ? OtherAssetHistoryAPI.list("-created_date") : Promise.resolve([]))
        ]);
        setAssets(Array.isArray(a) ? a : []);
        setAssetHistory(Array.isArray(h) ? h : []);
      } catch (e) {
        toast.error("Lỗi tải dữ liệu ban đầu");
      } finally {
        setIsLoading(false);
      }
    };
    if (currentUser) run();
  }, [currentUser]);

  const loadAssets = useCallback(async () => {
    const a = await OtherAssetAPI.list("-created_date");
    setAssets(Array.isArray(a) ? a : []);
    if (currentUser?.role === "admin") {
      const h = await OtherAssetHistoryAPI.list("-created_date");
      setAssetHistory(Array.isArray(h) ? h : []);
    }
  }, [currentUser]);

  // Derived helpers
  const isExported = useCallback((asset: OtherAsset) => {
    return Boolean(
      asset?.withdrawal_date &&
      String(asset.withdrawal_deliverer || "").trim() &&
      String(asset.withdrawal_receiver || "").trim()
    );
  }, []);

  const filteredAssets = useMemo(() => {
    if (!debouncedSearch) return assets;
    const q = debouncedSearch.toLowerCase();
    return assets.filter((a) =>
      a.name?.toLowerCase().includes(q) ||
      (a.depositor || "").toLowerCase().includes(q) ||
      (a.deposit_receiver || "").toLowerCase().includes(q) ||
      (a.withdrawal_receiver || "").toLowerCase().includes(q)
    );
  }, [assets, debouncedSearch]);

  const inStockAssets = useMemo(() => filteredAssets.filter((a) => !isExported(a)), [filteredAssets, isExported]);
  const exportedAssets = useMemo(() => filteredAssets.filter((a) => isExported(a)), [filteredAssets, isExported]);

  const inDateInRange = useCallback((d?: string | null) => {
    if (!d) return true;
    const iso = format(new Date(d), "yyyy-MM-dd");
    const afterStart = !filtersIn.depositStart || iso >= filtersIn.depositStart;
    const beforeEnd = !filtersIn.depositEnd || iso <= filtersIn.depositEnd;
    return afterStart && beforeEnd;
  }, [filtersIn.depositStart, filtersIn.depositEnd]);

  const outDateInRange = useCallback((d?: string | null) => {
    if (!d) return true;
    const iso = format(new Date(d), "yyyy-MM-dd");
    const afterStart = !filtersOut.withdrawStart || iso >= filtersOut.withdrawStart;
    const beforeEnd = !filtersOut.withdrawEnd || iso <= filtersOut.withdrawEnd;
    return afterStart && beforeEnd;
  }, [filtersOut.withdrawStart, filtersOut.withdrawEnd]);

  const inFiltered = useMemo(() => {
    return inStockAssets.filter(a =>
      inDateInRange(a.deposit_date) &&
      (!filtersIn.depositor || String(a.depositor || "").toLowerCase().includes(filtersIn.depositor.toLowerCase()))
    );
  }, [inStockAssets, inDateInRange, filtersIn.depositor]);

  const outFiltered = useMemo(() => {
    const p = (filtersOut.withdrawPerson || "").toLowerCase();
    return exportedAssets.filter(a =>
      outDateInRange(a.withdrawal_date) &&
      (!p || String(a.withdrawal_deliverer || "").toLowerCase().includes(p) || String(a.withdrawal_receiver || "").toLowerCase().includes(p))
    );
  }, [exportedAssets, outDateInRange, filtersOut.withdrawPerson]);

  const sortList = useCallback((list: OtherAsset[], key: string, dir: "asc" | "desc") => {
    const sorted = [...list].sort((a, b) => {
      const va = (a as any)[key] || "";
      const vb = (b as any)[key] || "";
      if (key.includes("date")) {
        const da = va ? new Date(va).getTime() : 0;
        const db = vb ? new Date(vb).getTime() : 0;
        return da - db;
      }
      return String(va).localeCompare(String(vb), "vi", { sensitivity: "base" });
    });
    return dir === "asc" ? sorted : sorted.reverse();
  }, []);

  const inSorted = useMemo(() => sortList(inFiltered, sortInKey, sortInDir), [inFiltered, sortInKey, sortInDir, sortList]);
  const outSorted = useMemo(() => sortList(outFiltered, sortOutKey, sortOutDir), [outFiltered, sortOutKey, sortOutDir, sortList]);

  const totalPagesIn = Math.max(1, Math.ceil(inSorted.length / PAGE_SIZE));
  const totalPagesOut = Math.max(1, Math.ceil(outSorted.length / PAGE_SIZE));
  const inPaged = useMemo(() => inSorted.slice((pageIn - 1) * PAGE_SIZE, pageIn * PAGE_SIZE), [inSorted, pageIn]);
  const outPaged = useMemo(() => outSorted.slice((pageOut - 1) * PAGE_SIZE, pageOut * PAGE_SIZE), [outSorted, pageOut]);

  useEffect(() => { setPageIn(1); }, [filtersIn, sortInKey, sortInDir, debouncedSearch]);
  useEffect(() => { setPageOut(1); }, [filtersOut, sortOutKey, sortOutDir, debouncedSearch]);

  const assetHistoryCount = useMemo(() => {
    const map: Record<string, number> = {};
    (assetHistory || []).forEach((h) => {
      map[h.asset_id] = (map[h.asset_id] || 0) + 1;
    });
    return map;
  }, [assetHistory]);

  const editAsset = useCallback((a: OtherAsset) => {
    setEditingAsset(a);
    setNewAsset({
      name: a.name || "",
      deposit_date: a.deposit_date || "",
      depositor: a.depositor || "",
      deposit_receiver: a.deposit_receiver || "",
      withdrawal_date: a.withdrawal_date || "",
      withdrawal_deliverer: a.withdrawal_deliverer || "",
      withdrawal_receiver: a.withdrawal_receiver || "",
      notes: a.notes || ""
    });
    setChangeReason("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const clearForm = useCallback(() => {
    setNewAsset({
      name: "",
      deposit_date: format(new Date(), "yyyy-MM-dd"),
      depositor: "",
      deposit_receiver: "",
      withdrawal_date: "",
      withdrawal_deliverer: "",
      withdrawal_receiver: "",
      notes: ""
    });
    setEditingAsset(null);
    setChangeReason("");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingAsset(null);
    setChangeReason("");
    clearForm();
  }, [clearForm]);

  const handleSave = useCallback(async () => {
    if (!newAsset.name || !newAsset.deposit_date) {
      toast.error("Vui lòng nhập tên tài sản và ngày gửi kho!");
      return;
    }
    if (editingAsset && !changeReason.trim()) {
      toast.error("Vui lòng nhập lý do thay đổi!");
      return;
    }

    const nowText = format(new Date(), "dd/MM/yyyy HH:mm");
    const finalAsset = { ...newAsset } as Partial<OtherAsset>;
    finalAsset.notes = `${editingAsset ? `[Cập nhật lúc ${nowText}]` : `[Tạo lúc ${nowText}]`} ${finalAsset.notes || ""}`.trim();

    try {
      if (editingAsset) {
        // dùng update with history ghi trong Edge Function
        await OtherAssetAPI.update(
          editingAsset.id,
          finalAsset,
          { changed_by: currentUser!.username, change_reason: changeReason.trim() }
        );
        toast.success("Cập nhật tài sản thành công");
      } else {
        await OtherAssetAPI.create({ ...finalAsset, created_by: currentUser?.email || null });
        toast.success("Thêm tài sản thành công");
      }
      clearForm();
      await loadAssets();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu tài sản");
    }
  }, [newAsset, editingAsset, changeReason, currentUser, clearForm, loadAssets]);

  const [assetToDelete, setAssetToDelete] = useState<OtherAsset | null>(null);
  const [historyToDelete, setHistoryToDelete] = useState<OtherAssetHistory | null>(null);

  const requestDeleteAsset = useCallback((a: OtherAsset) => {
    if (currentUser?.role !== "admin") {
      toast.error("Chỉ admin mới có quyền xóa tài sản!");
      return;
    }
    setAssetToDelete(a);
  }, [currentUser]);

  const performDeleteAsset = useCallback(async () => {
    if (!assetToDelete) return;
    try {
      await OtherAssetAPI.delete(assetToDelete.id, currentUser!.username);
      toast.success(`Đã xóa "${assetToDelete.name}"`);
      setAssetToDelete(null);
      await loadAssets();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xóa tài sản");
      setAssetToDelete(null);
    }
  }, [assetToDelete, currentUser, loadAssets]);

  const requestDeleteHistory = useCallback((h: OtherAssetHistory) => {
    if (currentUser?.role !== "admin") {
      toast.error("Chỉ admin mới có quyền xóa lịch sử!");
      return;
    }
    setHistoryToDelete(h);
  }, [currentUser]);

  const performDeleteHistory = useCallback(async () => {
    if (!historyToDelete) return;
    try {
      await OtherAssetHistoryAPI.delete(historyToDelete.id);
      toast.success("Đã xóa bản ghi lịch sử");
      setHistoryToDelete(null);
      await loadAssets();
      setSelectedAssetHistory((prev) => prev.filter((x) => x.id !== historyToDelete.id));
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xóa lịch sử");
      setHistoryToDelete(null);
    }
  }, [historyToDelete, loadAssets]);

  const showAssetHistory = useCallback(async (a: OtherAsset) => {
    const list = await OtherAssetHistoryAPI.listByAsset(a.id, "-created_date");
    setSelectedAssetHistory(list);
    setShowHistoryDialog(true);
  }, []);

  // CSV
  const exportListToCSV = useCallback((list: OtherAsset[], filenamePrefix: string) => {
    if (!list || list.length === 0) {
      toast.info("Không có dữ liệu để xuất CSV.");
      return;
    }
    const headers = ["Tên tài sản","Ngày gửi","Người gửi","Người nhận (gửi)","Ngày xuất","Người giao (xuất)","Người nhận (xuất)","Ghi chú"];
    const rows = [headers.join(",")];
    list.forEach(a => {
      const r = [
        a.name || "",
        a.deposit_date ? format(new Date(a.deposit_date), "dd/MM/yyyy") : "",
        a.depositor || "",
        a.deposit_receiver || "",
        a.withdrawal_date ? format(new Date(a.withdrawal_date), "dd/MM/yyyy") : "",
        a.withdrawal_deliverer || "",
        a.withdrawal_receiver || "",
        (a.notes || "").replace(/"/g, '""')
      ].map(v => `"${v}"`);
      rows.push(r.join(","));
    });
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenamePrefix}_${format(new Date(), "yyyyMMdd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Đã tải ${filenamePrefix}.csv`);
  }, []);

  const exportInStockToCSV = useCallback(() => exportListToCSV(inStockAssets, "TaiSanKhac_LuuKho"), [inStockAssets, exportListToCSV]);
  const exportExportedToCSV = useCallback(() => exportListToCSV(exportedAssets, "TaiSanKhac_DaXuat"), [exportedAssets, exportListToCSV]);

  if (!currentUser) {
    return (
      <div className="p-6 text-center text-slate-500">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <SonnerToaster />
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center">
            <Archive className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Tài sản, thùng khác gửi kho</h1>
            <p className="text-slate-600">Quản lý tài sản và thùng khác được gửi vào kho</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assets">TS khác lưu kho</TabsTrigger>
          <TabsTrigger value="exported">TS đã xuất</TabsTrigger>
          {currentUser.role === "admin" && (
            <TabsTrigger value="history">Lịch sử thay đổi</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="assets" className="space-y-6">
          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-indigo-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800">
                {editingAsset ? "Chỉnh sửa" : "Thêm mới"} tài sản gửi kho
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Tên tài sản / thùng</Label>
                  <Input
                    value={newAsset.name || ""}
                    onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                    placeholder="Nhập tên tài sản hoặc thùng"
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> Ngày gửi kho</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={`w-full justify-start text-left font-normal h-12 ${!newAsset.deposit_date ? "text-muted-foreground" : ""}`}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newAsset.deposit_date ? format(new Date(newAsset.deposit_date), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newAsset.deposit_date ? new Date(newAsset.deposit_date) : undefined}
                        onSelect={(date) => date && setNewAsset({ ...newAsset, deposit_date: format(date, "yyyy-MM-dd") })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Người gửi kho</Label>
                  <Input value={newAsset.depositor || ""} onChange={(e) => setNewAsset({ ...newAsset, depositor: e.target.value })} className="h-12" placeholder="Tên người gửi" />
                </div>

                <div className="space-y-2">
                  <Label>Người nhận (khi gửi)</Label>
                  <Input value={newAsset.deposit_receiver || ""} onChange={(e) => setNewAsset({ ...newAsset, deposit_receiver: e.target.value })} className="h-12" placeholder="Tên người nhận khi gửi" />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> Ngày xuất kho (nếu có)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={`w-full justify-start text-left font-normal h-12 ${!newAsset.withdrawal_date ? "text-muted-foreground" : ""}`}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newAsset.withdrawal_date ? format(new Date(newAsset.withdrawal_date), "dd/MM/yyyy") : <span>Chọn ngày</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newAsset.withdrawal_date ? new Date(newAsset.withdrawal_date) : undefined}
                        onSelect={(date) => setNewAsset({ ...newAsset, withdrawal_date: date ? format(date, "yyyy-MM-dd") : "" })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Người giao (khi xuất)</Label>
                  <Input value={newAsset.withdrawal_deliverer || ""} onChange={(e) => setNewAsset({ ...newAsset, withdrawal_deliverer: e.target.value })} className="h-12" placeholder="Tên người giao khi xuất" />
                </div>

                <div className="space-y-2">
                  <Label>Người nhận (khi xuất)</Label>
                  <Input value={newAsset.withdrawal_receiver || ""} onChange={(e) => setNewAsset({ ...newAsset, withdrawal_receiver: e.target.value })} className="h-12" placeholder="Tên người nhận khi xuất" />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Ghi chú</Label>
                  <Input value={newAsset.notes || ""} onChange={(e) => setNewAsset({ ...newAsset, notes: e.target.value })} className="h-12" placeholder="Ghi chú thêm (thời gian sẽ được thêm tự động)" />
                </div>

                {editingAsset && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Lý do thay đổi <span className="text-red-500">*</span></Label>
                    <Textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className="h-20" placeholder="Nhập lý do thay đổi thông tin tài sản (bắt buộc)" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button onClick={clearForm} variant="outline">Clear</Button>
                <Button onClick={cancelEdit} variant="outline">Hủy</Button>
                <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="w-4 h-4 mr-2" /> {editingAsset ? "Cập nhật" : "Lưu"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardContent className="p-6">
              <OtherAssetFilters
                mode="inStock"
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filters={filtersIn}
                onFiltersChange={setFiltersIn as any}
                sortKey={sortInKey}
                sortDirection={sortInDir}
                onSortKeyChange={setSortInKey}
                onSortDirectionChange={setSortInDir}
                onExportCSV={exportInStockToCSV}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-indigo-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800">Danh sách tài sản lưu kho ({inSorted.length} mục)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden md:block">
                <OtherAssetListTable
                  assets={inPaged}
                  isLoading={isLoading}
                  emptyText={searchTerm || filtersIn.depositStart || filtersIn.depositEnd || filtersIn.depositor ? "Không tìm thấy tài sản nào phù hợp với điều kiện tìm kiếm/lọc" : "Chưa có tài sản nào đang lưu kho"}
                  canShowHistory={currentUser.role === "admin"}
                  assetHistoryCount={assetHistoryCount}
                  onEdit={editAsset}
                  onDeleteRequest={requestDeleteAsset}
                  onShowHistory={showAssetHistory}
                />
              </div>
              <div className="block md:hidden p-4">
                <OtherAssetCardList
                  assets={inPaged}
                  isLoading={isLoading}
                  emptyText={searchTerm || filtersIn.depositStart || filtersIn.depositEnd || filtersIn.depositor ? "Không tìm thấy tài sản nào phù hợp với điều kiện tìm kiếm/lọc" : "Chưa có tài sản nào đang lưu kho"}
                  canShowHistory={currentUser.role === "admin"}
                  assetHistoryCount={assetHistoryCount}
                  onEdit={editAsset}
                  onDeleteRequest={requestDeleteAsset}
                  onShowHistory={showAssetHistory}
                />
              </div>
              <div className="px-4 pb-4">
                <Pagination currentPage={pageIn} totalPages={totalPagesIn} onPageChange={setPageIn} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exported" className="space-y-6">
          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardContent className="p-6">
              <OtherAssetFilters
                mode="exported"
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filters={filtersOut}
                onFiltersChange={setFiltersOut as any}
                sortKey={sortOutKey}
                sortDirection={sortOutDir}
                onSortKeyChange={setSortOutKey}
                onSortDirectionChange={setSortOutDir}
                onExportCSV={exportExportedToCSV}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl shadow-slate-100/50">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-indigo-50 border-b border-slate-200">
              <CardTitle className="text-lg font-semibold text-slate-800">Danh sách tài sản đã xuất ({outSorted.length} mục)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden md:block">
                <OtherAssetListTable
                  assets={outPaged}
                  isLoading={isLoading}
                  emptyText={searchTerm || filtersOut.withdrawStart || filtersOut.withdrawEnd || filtersOut.withdrawPerson ? "Không tìm thấy tài sản nào phù hợp với điều kiện tìm kiếm/lọc" : "Chưa có tài sản nào đã xuất"}
                  canShowHistory={currentUser.role === "admin"}
                  assetHistoryCount={assetHistoryCount}
                  onEdit={editAsset}
                  onDeleteRequest={requestDeleteAsset}
                  onShowHistory={showAssetHistory}
                />
              </div>
              <div className="block md:hidden p-4">
                <OtherAssetCardList
                  assets={outPaged}
                  isLoading={isLoading}
                  emptyText={searchTerm || filtersOut.withdrawStart || filtersOut.withdrawEnd || filtersOut.withdrawPerson ? "Không tìm thấy tài sản nào phù hợp với điều kiện tìm kiếm/lọc" : "Chưa có tài sản nào đã xuất"}
                  canShowHistory={currentUser.role === "admin"}
                  assetHistoryCount={assetHistoryCount}
                  onEdit={editAsset}
                  onDeleteRequest={requestDeleteAsset}
                  onShowHistory={showAssetHistory}
                />
              </div>
              <div className="px-4 pb-4">
                <Pagination currentPage={pageOut} totalPages={totalPagesOut} onPageChange={setPageOut} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {currentUser.role === "admin" && (
          <TabsContent value="history" className="space-y-6">
            <Card className="border-0 shadow-xl shadow-slate-100/50">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50 border-b border-slate-200">
                <CardTitle className="text-lg font-semibold text-slate-800">Lịch sử thay đổi tài sản ({assetHistory.length} bản ghi)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên tài sản</TableHead>
                        <TableHead>Loại thay đổi</TableHead>
                        <TableHead>Người thay đổi</TableHead>
                        <TableHead>Lý do</TableHead>
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assetHistory.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center h-24">Chưa có lịch sử thay đổi nào</TableCell></TableRow>
                      ) : (
                        assetHistory.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="font-medium">{h.asset_name}</TableCell>
                            <TableCell>
                              <Badge variant={h.change_type === "delete" ? "destructive" : "secondary"}>
                                {h.change_type === "update" ? "Cập nhật" : "Xóa"}
                              </Badge>
                            </TableCell>
                            <TableCell>{h.changed_by}</TableCell>
                            <TableCell>{h.change_reason || "-"}</TableCell>
                            <TableCell>{format(new Date(h.created_date), "dd/MM/yyyy HH:mm")}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700"> <Info className="w-4 h-4" /> </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader><DialogTitle>Chi tiết thay đổi - {h.asset_name}</DialogTitle></DialogHeader>
                                    <div className="space-y-4">
                                      <div>
                                        <h4 className="font-medium mb-2">Dữ liệu cũ:</h4>
                                        <pre className="bg-slate-100 p-3 rounded text-sm overflow-auto">{JSON.stringify(JSON.parse(h.old_data), null, 2)}</pre>
                                      </div>
                                      {h.change_type === "update" && (
                                        <div>
                                          <h4 className="font-medium mb-2">Dữ liệu mới:</h4>
                                          <pre className="bg-slate-100 p-3 rounded text-sm overflow-auto">{JSON.stringify(JSON.parse(h.new_data), null, 2)}</pre>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                                <Button variant="ghost" size="sm" onClick={() => requestDeleteHistory(h)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                  Xóa
                                </Button>
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
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Lịch sử thay đổi tài sản</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {selectedAssetHistory.length === 0 ? (
              <p className="text-center text-slate-500">Không có lịch sử thay đổi</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại thay đổi</TableHead>
                    <TableHead>Người thay đổi</TableHead>
                    <TableHead>Lý do</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedAssetHistory.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <Badge variant={h.change_type === "delete" ? "destructive" : "secondary"}>
                          {h.change_type === "update" ? "Cập nhật" : "Xóa"}
                        </Badge>
                      </TableCell>
                      <TableCell>{h.changed_by}</TableCell>
                      <TableCell>{h.change_reason || "-"}</TableCell>
                      <TableCell>{format(new Date(h.created_date), "dd/MM/yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!assetToDelete} onOpenChange={(open) => !open && setAssetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa tài sản?</AlertDialogTitle>
            <AlertDialogDescription>Bạn chắc chắn muốn xóa tài sản "{assetToDelete?.name}"? Hành động này không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={performDeleteAsset}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!historyToDelete} onOpenChange={(open) => !open && setHistoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa bản ghi lịch sử?</AlertDialogTitle>
            <AlertDialogDescription>Bạn chắc chắn muốn xóa bản ghi lịch sử này?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={performDeleteHistory}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}