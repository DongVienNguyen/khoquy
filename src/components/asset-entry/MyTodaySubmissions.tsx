"use client";

import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, RefreshCcw, Download } from "lucide-react";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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

const FUNCTION_URL = `${SUPABASE_PUBLIC_URL}/functions/v1/asset-transactions`;

const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"] as const;
const TYPES = ["Xuất kho", "Mượn TS", "Thay bìa"] as const;

async function callAssetFunc(body: Record<string, any>) {
  try {
    const { data, error } = await supabase.functions.invoke("asset-transactions", { body });
    if (!error) {
      // Chuẩn hóa payload (có thể trả về { data } hoặc mảng trực tiếp)
      const payload = data as any;
      const normalized = payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
      return { ok: true, data: normalized };
    }
  } catch {
    // fallback sang fetch nếu invoke lỗi
  }
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
    return { ok: false, error: (json as any)?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to fetch" };
  }
}

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

function gmt7TodayYMD() {
  const now = new Date();
  const gmt7 = new Date(now.getTime() + 7 * 3600 * 1000);
  const y = gmt7.getUTCFullYear();
  const m = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const d = String(gmt7.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MyTodaySubmissions: React.FC = () => {
  const [rows, setRows] = React.useState<AssetTx[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const staff = React.useMemo(() => getLoggedInStaff(), []);
  const [selectedRoom, setSelectedRoom] = React.useState<string>("all");
  const [selectedType, setSelectedType] = React.useState<string>("all");
  const [autoRefresh, setAutoRefresh] = React.useState<boolean>(() => {
    try { return localStorage.getItem("today_auto_refresh") === "true"; } catch { return false; }
  });

  React.useEffect(() => {
    try { localStorage.setItem("today_auto_refresh", autoRefresh ? "true" : "false"); } catch {}
  }, [autoRefresh]);

  const loadToday = React.useCallback(async () => {
    if (!staff) return;
    setIsLoading(true);
    try {
      const res = await callAssetFunc({ action: "list_mine_today", staff_username: staff.username });
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Không thể tải danh sách hôm nay");
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
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (!document.hidden) loadToday();
    }, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, loadToday]);

  React.useEffect(() => {
    loadToday();
  }, [loadToday]);

  React.useEffect(() => {
    const onSubmitted = () => loadToday();
    window.addEventListener("asset:submitted", onSubmitted as any);
    return () => window.removeEventListener("asset:submitted", onSubmitted as any);
  }, [loadToday]);

  const filteredRows = React.useMemo(() => {
    let list = rows;
    if (selectedRoom !== "all") list = list.filter((r) => r.room === selectedRoom);
    if (selectedType !== "all") list = list.filter((r) => r.transaction_type === selectedType);
    return list;
  }, [rows, selectedRoom, selectedType]);

  const exportCSV = React.useCallback(() => {
    if (!filteredRows.length) {
      toast.info("Không có dữ liệu để xuất.");
      return;
    }
    const esc = (s: any) => {
      const v = String(s ?? "");
      const w = v.replace(/"/g, '""');
      return /[",\n\r]/.test(w) ? `"${w}"` : w;
    };
    const header = ["Phòng","Năm TS","Mã TS","Loại","Ngày","Buổi","Ghi chú","CB","Time nhắn"];
    const lines: string[] = [header.join(",")];
    for (const r of filteredRows) {
      lines.push([
        esc(r.room),
        esc(r.asset_year),
        esc(r.asset_code),
        esc(r.transaction_type),
        esc(r.transaction_date),
        esc(r.parts_day),
        esc(r.note ?? ""),
        esc(r.staff_code),
        esc(r.notified_at),
      ].join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MyToday_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filteredRows]);

  const updateNote = React.useCallback(
    async (row: AssetTx) => {
      const newNote = prompt("Nhập ghi chú mới", row.note ?? "") ?? null;
      if (newNote === null) return;
      const res = await callAssetFunc({
        action: "update_note",
        id: row.id,
        note: newNote,
        editor_username: staff?.username || "",
      });
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Không thể cập nhật ghi chú");
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
      const res = await callAssetFunc({
        action: "soft_delete",
        id,
        deleted_by: staff?.username || "",
      });
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Không thể xóa");
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
            Hiển thị các giao dịch bạn đã tạo trong ngày (GMT+7), chưa xóa.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={loadToday} variant="outline" className="h-9" disabled={isLoading}>
              <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Làm mới
            </Button>
            <Button onClick={exportCSV} variant="outline" className="h-9">
              <Download className="w-4 h-4 mr-2" /> Xuất CSV
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <span className="text-sm text-slate-600">Phòng</span>
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-slate-600">Loại</span>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Chọn loại" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              Auto refresh 60s
            </label>
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
            {filteredRows.length === 0 ? (
              <tr>
                <td className="py-3 px-3 text-muted-foreground" colSpan={8}>
                  {isLoading ? "Đang tải..." : "Chưa có giao dịch nào hôm nay."}
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
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