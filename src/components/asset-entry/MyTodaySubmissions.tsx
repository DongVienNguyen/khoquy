"use client";

import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, RefreshCcw } from "lucide-react";
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

const MyTodaySubmissions: React.FC = () => {
  const [rows, setRows] = React.useState<AssetTx[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const staff = React.useMemo(() => getLoggedInStaff(), []);

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

  React.useEffect(() => {
    loadToday();
  }, [loadToday]);

  React.useEffect(() => {
    const onSubmitted = () => loadToday();
    window.addEventListener("asset:submitted", onSubmitted as any);
    return () => window.removeEventListener("asset:submitted", onSubmitted as any);
  }, [loadToday]);

  const updateNote = React.useCallback(
    async (row: AssetTx) => {
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
    [staff?.username]
  );

  const removeTransaction = React.useCallback(
    async (id: string) => {
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
    [staff?.username]
  );

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Các TS đã nhắn trong ngày, chưa xóa.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={loadToday} variant="outline" className="h-9" disabled={isLoading}>
              <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Làm mới
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
              <th className="py-2 px-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 px-3 text-muted-foreground" colSpan={8}>
                  {isLoading ? "Đang tải..." : "Chưa có giao dịch nào hôm nay."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
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
  );
};

export default MyTodaySubmissions;