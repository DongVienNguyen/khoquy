"use client";

import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, RefreshCcw } from "lucide-react";
import EditTransactionDialog from "@/components/asset-entry/EditTransactionDialog";
import { edgeInvoke, friendlyErrorMessage } from "@/lib/edge-invoke";
import DatePickerLazy from "@/components/asset-entry/DatePickerLazy";

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
};

function getLoggedInStaff(): { username?: string } | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("loggedInStaff") : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

function gmt7TodayYMD(): string {
  const now = new Date();
  const gmt7 = new Date(now.getTime() + 7 * 3600 * 1000);
  const yyyy = gmt7.getUTCFullYear();
  const mm = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(gmt7.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const MyTodaySubmissions: React.FC<{ isOpen?: boolean }> = ({ isOpen = true }) => {
  const [rows, setRows] = React.useState<AssetTx[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [editingTx, setEditingTx] = React.useState<AssetTx | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState<boolean>(false);
  const staff = React.useMemo(() => getLoggedInStaff(), []);

  // View mode: today or search
  const [viewMode, setViewMode] = React.useState<"today" | "search">("today");

  // Search state
  const [startDate, setStartDate] = React.useState<Date | null>(null);
  const [endDate, setEndDate] = React.useState<Date | null>(null);
  const [searchRows, setSearchRows] = React.useState<AssetTx[]>([]);
  const [isSearching, setIsSearching] = React.useState<boolean>(false);

  // Limit UI date pickers to [today - 30 days, today]
  const gmt7Now = React.useMemo(() => {
    const now = new Date();
    return new Date(now.getTime() + 7 * 3600 * 1000);
  }, []);
  const maxDate = React.useMemo(() => {
    const d = new Date(gmt7Now);
    d.setUTCHours(0, 0, 0, 0);
    return new Date(d.getTime() - 7 * 3600 * 1000); // about local midnight conversion
  }, [gmt7Now]);
  const minDate = React.useMemo(() => {
    const d = new Date(gmt7Now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - 30);
    return new Date(d.getTime() - 7 * 3600 * 1000);
  }, [gmt7Now]);

  const formatDateShort = React.useCallback((date: Date | null) => {
    if (!date) return "Chọn ngày";
    const d = new Date(date);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }, []);

  const getYmd = React.useCallback((d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const hasLoadedRef = React.useRef<boolean>(false);
  const needsRefreshRef = React.useRef<boolean>(false);

  const loadToday = React.useCallback(async () => {
    if (!staff) return;
    setIsLoading(true);
    try {
      const res = await edgeInvoke<AssetTx[]>("asset-transactions", { action: "list_mine_today", staff_username: staff.username });
      if (!res.ok) {
        toast.error(friendlyErrorMessage(res.error));
        setRows([]);
        return;
      }
      const all = (res.data as AssetTx[]) || [];
      const todayStr = gmt7TodayYMD();
      const todayOnly = all.filter((t) => {
        if (t.is_deleted) return false;
        const notif = new Date(t.notified_at);
        const gmt7 = new Date(notif.getTime() + 7 * 3600 * 1000);
        const ymd = `${gmt7.getUTCFullYear()}-${String(gmt7.getUTCMonth() + 1).padStart(2, "0")}-${String(gmt7.getUTCDate()).padStart(2, "0")}`;
        const txYmd = String(t.transaction_date);
        return ymd === todayStr && txYmd >= todayStr;
      });
      setRows(todayOnly);
    } finally {
      setIsLoading(false);
    }
  }, [staff]);

  // Lazy load only when isOpen -> true, and only once per open session
  React.useEffect(() => {
    if (isOpen && !hasLoadedRef.current) {
      loadToday();
      hasLoadedRef.current = true;
      // If there was a pending refresh while closed
      if (needsRefreshRef.current) {
        needsRefreshRef.current = false;
        loadToday();
      }
    }
  }, [isOpen, loadToday]);

  // Refresh when asset submitted only if open now; else mark pending
  React.useEffect(() => {
    const onSubmitted = () => {
      if (isOpen) loadToday();
      else needsRefreshRef.current = true;
    };
    window.addEventListener("asset:submitted", onSubmitted as any);
    return () => window.removeEventListener("asset:submitted", onSubmitted as any);
  }, [isOpen, loadToday]);

  // Perform search only when user clicks "Tìm kiếm"
  const performSearch = React.useCallback(async () => {
    if (!staff) return;
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn đủ 'Từ ngày' và 'Đến ngày'.");
      return;
    }
    // Clamp UI dates to [minDate, maxDate]
    const s = new Date(Math.max(startDate.getTime(), minDate.getTime()));
    const e = new Date(Math.min(endDate.getTime(), maxDate.getTime()));
    if (s.getTime() > e.getTime()) {
      toast.error("'Từ ngày' không được lớn hơn 'Đến ngày'.");
      return;
    }
    setIsSearching(true);
    try {
      const res = await edgeInvoke<AssetTx[]>("asset-transactions", {
        action: "list_mine_range",
        staff_username: staff.username,
        start_ymd: getYmd(s),
        end_ymd: getYmd(e),
      });
      if (!res.ok) {
        toast.error(friendlyErrorMessage(res.error));
        setSearchRows([]);
        return;
      }
      const list = (res.data as AssetTx[]) || [];
      setSearchRows(list);
      setViewMode("search");
    } finally {
      setIsSearching(false);
    }
  }, [staff, startDate, endDate, minDate, maxDate, getYmd]);

  const updateNote = React.useCallback(
    async (row: AssetTx) => {
      if (viewMode === "search") return; // disable in search mode
      const newNote = prompt("Nhập ghi chú mới", row.note ?? "") ?? null;
      if (newNote === null) return;
      const res = await edgeInvoke("asset-transactions", {
        action: "update_note",
        id: row.id,
        note: newNote,
        editor_username: staff?.username || "",
      });
      if (!res.ok) {
        toast.error(friendlyErrorMessage(res.error));
        return;
      }
      toast.success("Đã cập nhật ghi chú");
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, note: newNote } : x)));
    },
    [staff?.username, viewMode]
  );

  const removeTransaction = React.useCallback(
    async (id: string) => {
      if (viewMode === "search") return; // disable in search mode
      if (!confirm("Bạn có chắc chắn muốn xóa (mềm) giao dịch này?")) return;
      const res = await edgeInvoke("asset-transactions", {
        action: "soft_delete",
        id,
        deleted_by: staff?.username || "",
      });
      if (!res.ok) {
        toast.error(friendlyErrorMessage(res.error));
        return;
      }
      toast.success("Đã xóa (mềm)");
      setRows((prev) => prev.filter((r) => r.id !== id));
    },
    [staff?.username, viewMode]
  );

  const displayRows = viewMode === "today" ? rows : searchRows;

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {viewMode === "today" ? "Các TS đã nhắn trong ngày, chưa xóa." : "Kết quả tìm kiếm theo khoảng ngày (tối đa 30 ngày gần nhất)."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={viewMode === "today" ? loadToday : performSearch}
              variant="outline"
              className="h-9"
              disabled={viewMode === "today" ? isLoading : isSearching}
            >
              <RefreshCcw className={`w-4 h-4 mr-2 ${viewMode === "today" ? (isLoading ? "animate-spin" : "") : (isSearching ? "animate-spin" : "")}`} />
              {viewMode === "today" ? "Làm mới" : "Tìm lại"}
            </Button>
          </div>
        </div>

        {/* Search controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground mb-1">Từ ngày</span>
            <DatePickerLazy
              selected={startDate}
              minDate={minDate}
              onSelect={(d) => setStartDate(d)}
              formatDateShort={formatDateShort}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground mb-1">Đến ngày</span>
            <DatePickerLazy
              selected={endDate}
              minDate={minDate}
              onSelect={(d) => setEndDate(d)}
              formatDateShort={formatDateShort}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={performSearch}
              disabled={isSearching || !startDate || !endDate}
              className="w-full md:w-auto"
            >
              {isSearching ? "Đang tìm..." : "Tìm kiếm"}
            </Button>
          </div>
        </div>
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
              {viewMode === "today" ? <th className="py-2 px-3">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td className="py-3 px-3 text-muted-foreground" colSpan={viewMode === "today" ? 8 : 7}>
                  {viewMode === "today" ? (isLoading ? "Đang tải..." : "Chưa có giao dịch nào hôm nay.") : (isSearching ? "Đang tìm..." : "Không có kết quả trong khoảng ngày đã chọn.")}
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 px-3">{r.room}</td>
                  <td className="py-2 px-3">{r.asset_year}</td>
                  <td className="py-2 px-3">{r.asset_code}</td>
                  <td className="py-2 px-3">{r.transaction_type}</td>
                  <td className="py-2 px-3">{r.transaction_date}</td>
                  <td className="py-2 px-3">{r.parts_day}</td>
                  <td className="py-2 px-3">{r.note ?? ""}</td>
                  {viewMode === "today" ? (
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          title="Sửa giao dịch"
                          className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-muted"
                          onClick={() => { setEditingTx(r); setIsEditOpen(true); }}
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
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editingTx && viewMode === "today" && (
        <EditTransactionDialog
          open={isEditOpen}
          onOpenChange={(v: boolean) => { setIsEditOpen(v); if (!v) setEditingTx(null); }}
          transaction={editingTx}
          editorUsername={staff?.username || "unknown"}
          onUpdated={(updated: AssetTx) => {
            setRows((prev) => prev.map((x) => x.id === updated.id ? updated : x));
            setEditingTx(null);
            setIsEditOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default MyTodaySubmissions;