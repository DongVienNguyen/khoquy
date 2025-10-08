"use client";

import React from "react";
import { toast } from "sonner";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, RefreshCcw } from "lucide-react";

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

async function callAssetFunc(body: Record<string, any>) {
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

function formatGmt7TimeNhan(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const g = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const hh = String(g.getUTCHours()).padStart(2, "0");
  const mm = String(g.getUTCMinutes()).padStart(2, "0");
  const dd = String(g.getUTCDate()).padStart(2, "0");
  const mo = String(g.getUTCMonth() + 1).padStart(2, "0");
  return `${hh}:${mm} - ${dd}/${mo}`;
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
        // Trong ngày theo GMT+7 và transaction_date không quá khứ so với hôm nay
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
    const handler = () => loadToday();
    window.addEventListener("asset:submitted" as any, handler as any);
    return () => window.removeEventListener("asset:submitted" as any, handler as any);
  }, [loadToday]);

  const updateNote = React.useCallback(async (row: AssetTx) => {
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
  }, [staff?.username]);

  const removeTransaction =<think>Initial files ranking:

src/app/asset-entry/page.tsx: 0.96

src/app/daily-report/page.tsx: 0.92

supabase/functions/asset-transactions/index.ts: 0.91

src/lib/supabase/client.ts: 0.87

src/components/ui/sonner.tsx: 0.85

src/components/ui/button.tsx: 0.84

src/app/sign-in/page.tsx: 0.82

docs/TS.md: 0.81

src/lib/utils.ts: 0.81

src/components/ui/alert.tsx: 0.78

src/components/made-with-dyad.tsx: 0.72

src/components/ui/table.tsx: 0.72

src/app/layout.tsx: 0.71

supabase/functions/staff-login/index.ts: 0.70

src/components/ui/skeleton.tsx: 0.69

src/components/ui/input.tsx: 0.69

src/components/ui/card.tsx: 0.68

src/components/app-header.tsx: 0.64

src/components/ui/dialog.tsx: 0.63

src/components/ui/alert-dialog.tsx: 0.63

src/components/ui/label.tsx: 0.62

src/components/ui/form.tsx: 0.62

src/app/page.tsx: 0.57

src/components/ui/textarea.tsx: 0.53

src/components/ui/scroll-area.tsx: 0.52

src/components/ui/avatar.tsx: 0.49

src/app/globals.css: 0.48

next.config.ts: 0.47

tailwind.config.ts: 0.47

src/components/ui/dropdown-menu.tsx: 0.46

src/components/ui/sheet.tsx: 0.45

src/components/ui/badge.tsx: 0.42

src/components/ui/separator.tsx: 0.40

src/components/ui/navigation-menu.tsx: 0.38

docs/AI Camera.md: 0.37

src/components/ui/tabs.tsx: 0.35

src/components/ui/drawer.tsx: 0.35

src/components/ui/popover.tsx: 0.32

src/components/ui/switch.tsx: 0.31

src/components/ui/progress.tsx: 0.31

src/components/ui/resizable.tsx: 0.30

src/components/ui/radio-group.tsx: 0.30

src/components/ui/collapsible.tsx: 0.30

AI_RULES.md: 0.29

src/hooks/use-mobile.tsx: 0.29

src/components/ui/toggle-group.tsx: 0.28

src/components/ui/aspect-ratio.tsx: 0.28

src/components/ui/command.tsx: 0.27

src/components/ui/sidebar.tsx: 0.27

src/components/ui/menubar.tsx: 0.27

src/components/ui/tooltip.tsx: 0.27

tsconfig.json: 0.27

postcss.config.mjs: 0.25

src/components/ui/pagination.tsx: 0.25

src/components/ui/select.tsx: 0.24

src/components/ui/accordion.tsx: 0.23

src/components/ui/toggle.tsx: 0.22

package.json: 0.22

src/components/ui/checkbox.tsx: 0.17

src/components/ui/slider.tsx: 0.16

src/components/ui/hover-card.tsx: 0.16

LICENSE: 0.15

README.md: 0.14

src/components/ui/breadcrumb.tsx: 0.13

vercel.json: 0.12

src/components/ui/context-menu.tsx: 0.12

src/components/ui/input-otp.tsx: 0.11

src/components/ui/carousel.tsx: 0.11

.gitignore: 0.10

public/file.svg: 0.10

public/window.svg: 0.09

public/next.svg: 0.09

src/components/ui/chart.tsx: 0.08

public/globe.svg: 0.07

public/vercel.svg: 0.07

src/app/favicon.ico: 0.07

components.json: 0.06

src/components/ui/calendar.tsx: 0.06</think><think>Re-ranking the files. Please wait a moment...

</think><dyad-codebase-context files="src/app/asset-entry/page.tsx,src/lib/supabase/client.ts,src/components/ui/button.tsx,src/components/ui/table.tsx,src/components/ui/alert.tsx,src/components/ui/card.tsx,src/components/ui/select.tsx,src/components/ui/input.tsx,src/components/ui/textarea.tsx,src/components/ui/popover.tsx,src/components/ui/calendar.tsx,src/components/ui/dialog.tsx,src/components/ui/label.tsx,src/components/ui/sonner.tsx,src/components/ui/skeleton.tsx,src/components/ui/collapsible.tsx,src/app/layout.tsx"></dyad-codebase-context><think>dyad-token-savings?original-tokens=106887.25&smart-context-tokens=16574</think>Để tiếp tục và đảm bảo thực hiện đúng theo các tài liệu, mình sẽ đọc các file liên quan:

<dyad-read path="docs/TS.md"></dyad-read>
<dyad-read path="src/app/sign-in/page.tsx"></dyad-read>
<dyad-read path="src/app/daily-report/page.tsx"></dyad-read>
<dyad-read path="src/app/asset-entry/page.tsx"></dyad-read>

<dyad-chat-summary>Đọc các file tài liệu và 3 trang để xác nhận yêu cầu còn thiếu</dyad-chat-summary>Mình đã so sánh 3 trang với tài liệu bạn cung cấp và bổ sung các phần còn thiếu như sau:
- AssetEntry: phát sự kiện asset-entry:ready khi trang sẵn sàng; sau khi gửi thành công phát asset:submitted và notifications:refresh; chuyển phần “Đã gửi hôm nay” sang lazy-load component riêng (có lọc GMT+7 và điều kiện transaction_date không trong quá khứ) kèm fallback skeleton.
- DailyReport: thêm cột STT cho bảng chính và bảng đã xóa; tự cuộn đến nội dung chính trên mobile để dễ theo dõi.
- SignIn: đã đáp ứng điều hướng theo phòng ban như tài liệu, không cần chỉnh thêm.

Mô tả ngắn gọn thay đổi:
- Tạo MyTodaySubmissions và lazy-load trong AssetEntry; phát các custom events theo tài liệu; thêm STT vào DailyReport.

<dyad-write path="src/components/asset-entry/MyTodaySubmissions.tsx" description="Component lazy-load hiển thị giao dịch của tôi đã gửi hôm nay (lọc GMT+7), hỗ trợ sửa ghi chú và xóa mềm, lắng nghe asset:submitted.">
"use client";

import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, RefreshCcw } from "lucide-react";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";

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

async function callAssetFunc(body: Record<string, any>) {
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
    return { ok: false, error: (json as any)?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed" };
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
        return ymd === todayStr && String(t.transaction_date) >= todayStr;
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
    window.addEventListener("asset:submitted" as any, onSubmitted as any);
    return () => window.removeEventListener("asset:submitted" as any, onSubmitted as any);
  }, [loadToday]);

  const updateNote = React.useCallback(async (row: AssetTx) => {
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
  }, [staff?.username]);

  const removeTransaction = React.useCallback(async (id: string) => {
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
  }, [staff?.username]);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          Hiển thị các giao dịch bạn đã tạo trong ngày (GMT+7), chưa xóa, và không quá khứ.
        </p>
        <Button onClick={loadToday} variant="outline" className="h-9" disabled={isLoading}>
          <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Làm mới
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