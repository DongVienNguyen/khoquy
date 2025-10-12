"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { RefreshCcw, Download } from "lucide-react";

type TxRow = {
  id: string;
  transaction_date: string;
  room: string;
  transaction_type: "Xuất kho" | "Mượn TS" | "Thay bìa" | string;
  is_deleted?: boolean;
};

const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"];
const TYPES = ["Xuất kho", "Mượn TS", "Thay bìa"];

function getDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: toYMD(start), end: toYMD(end) };
}

const COLORS = {
  line: "#2563eb",
  grid: "#e2e8f0",
  rooms: ["#0ea5e9", "#f97316", "#10b981", "#f59e0b", "#6366f1", "#ef4444"],
  types: {
    "Xuất kho": "#22c55e",
    "Mượn TS": "#f43f5e",
    "Thay bìa": "#8b5cf6",
    other: "#64748b",
  },
};

const StatsOverview: React.FC = () => {
  const def = getDefaultRange();
  const [startDate, setStartDate] = useState(def.start);
  const [endDate, setEndDate] = useState(def.end);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Thêm trạng thái lọc và auto-refresh
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    try {
      return localStorage.getItem("stats_auto_refresh") === "true";
    } catch { return false; }
  });
  const [includeDeleted, setIncludeDeleted] = useState<boolean>(() => {
    try { return localStorage.getItem("stats_include_deleted") === "true"; } catch { return false; }
  });

  // Lưu auto-refresh vào localStorage khi thay đổi
  useEffect(() => {
    try {
      localStorage.setItem("stats_auto_refresh", autoRefresh ? "true" : "false");
    } catch {}
  }, [autoRefresh]);

  useEffect(() => {
    try {
      localStorage.setItem("stats_include_deleted", includeDeleted ? "true" : "false");
    } catch {}
  }, [includeDeleted]);

  const load = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn đủ ngày bắt đầu và kết thúc.");
      return;
    }
    setIsLoading(true);
    try {
      // gọi edge function asset-transactions -> list_range
      const { data, error } = await supabase.functions.invoke("asset-transactions", {
        body: { action: "list_range", start: startDate, end: endDate, include_deleted: includeDeleted },
        headers: { Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}` },
      });
      if (error) throw error;
      const payload = (data?.data ?? data) as TxRow[] | undefined;
      const all = Array.isArray(payload) ? payload : [];
      // áp dụng lọc phòng/loại ở client
      const filtered = all.filter(r => (selectedRoom === "all" ? true : r.room === selectedRoom))
                          .filter(r => (selectedType === "all" ? true : r.transaction_type === selectedType));
      setRows(filtered);
    } catch (e: any) {
      toast.error(e?.message || "Không thể tải dữ liệu thống kê");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedRoom, selectedType, includeDeleted]);

  useEffect(() => { load(); }, []); // initial

  // Auto-refresh mỗi 60s nếu bật và tab đang hiển thị
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  // Tự động load khi thay đổi lọc/ngày (debounce)
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 400);
    return () => clearTimeout(t);
  }, [startDate, endDate, selectedRoom, selectedType, includeDeleted, load]);

  // Export CSV tổng hợp (daily, room, type)
  const exportSummaryCSV = useCallback(() => {
    const esc = (s: any) => {
      const v = String(s ?? "");
      const w = v.replace(/"/g, '""');
      return /[",\n\r]/.test(w) ? `"${w}"` : w;
    };
    const lines: string[] = [];
    lines.push(`Từ ngày,${esc(startDate)},Đến ngày,${esc(endDate)},Phòng,${esc(selectedRoom)},Loại,${esc(selectedType)},Bao gồm đã xóa,${includeDeleted ? "Có" : "Không"}`);
    lines.push("");

    // Daily
    lines.push("Daily,date,count");
    dailyData.forEach(d => {
      lines.push(`${esc(d.date)},${esc(d.count)}`);
    });

    // Room
    lines.push("");
    lines.push("Rooms,room,count");
    roomData.forEach(r => {
      lines.push(`${esc(r.room)},${esc(r.count)}`);
    });

    // Type
    lines.push("");
    lines.push("Types,name,count");
    typeData.forEach(t => {
      lines.push(`${esc(t.name)},${esc(t.value)}`);
    });

    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Stats_Summary_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [startDate, endDate, selectedRoom, selectedType, includeDeleted, dailyData, roomData, typeData]);

  // Build series per day (áp dụng lọc client bổ sung nếu cần)
  const dailyData = useMemo(() => {
    const source = rows;
    if (!source.length) return [];
    const countMap = new Map<string, number>();
    for (const r of source) {
      const d = r.transaction_date;
      countMap.set(d, (countMap.get(d) || 0) + 1);
    }
    const list: { date: string; count: number }[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      list.push({ date: key, count: countMap.get(key) || 0 });
    }
    return list;
  }, [rows, startDate, endDate]);

  // Room breakdown
  const roomData = useMemo(() => {
    const roomMap: Record<string, number> = {};
    for (const r of rows) {
      const k = r.room || "Khác";
      roomMap[k] = (roomMap[k] || 0) + 1;
    }
    const order = [...ROOMS, ...Object.keys(roomMap).filter(k => !ROOMS.includes(k))];
    return order.filter(k => roomMap[k]).map((k) => ({ room: k, count: roomMap[k] }));
  }, [rows]);

  // Type distribution
  const typeData = useMemo(() => {
    const tmap: Record<string, number> = {};
    for (const r of rows) {
      const t = TYPES.includes(r.transaction_type) ? r.transaction_type : "Khác";
      tmap[t] = (tmap[t] || 0) + 1;
    }
    return Object.entries(tmap).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const totalCount = rows.length;

  return (
    <div className="space-y-6">
      <div className="border rounded-lg shadow-sm">
        <div className="p-4 border-b bg-slate-50">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="font-semibold">Bộ lọc thời gian</div>
              <p className="text-sm text-slate-600">Chọn khoảng ngày để xem thống kê giao dịch</p>
            </div>
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="space-y-1">
                <Label>Ngày bắt đầu</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Ngày kết thúc</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Phòng</Label>
                <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                  <SelectTrigger className="h-10 min-w-[160px]"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Loại</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="h-10 min-w-[160px]"><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <Button onClick={load} disabled={isLoading} className="h-10">
                  <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  {isLoading ? "Đang tải..." : "Tải dữ liệu"}
                </Button>
                <Button onClick={exportSummaryCSV} variant="outline" className="h-10">
                  <Download className="w-4 h-4 mr-2" />
                  Xuất CSV
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                  Auto refresh
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={includeDeleted} onCheckedChange={setIncludeDeleted} />
                  Bao gồm đã xóa
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md border p-4 bg-white">
            <div className="text-sm text-slate-600">Tổng số giao dịch</div>
            <div className="text-2xl font-bold mt-1">{totalCount}</div>
          </div>
          <div className="rounded-md border p-4 bg-white">
            <div className="text-sm text-slate-600">Ngày có giao dịch</div>
            <div className="text-2xl font-bold mt-1">{dailyData.filter(d => d.count > 0).length}</div>
          </div>
          <div className="rounded-md border p-4 bg-white">
            <div className="text-sm text-slate-600">Phòng tham gia</div>
            <div className="text-2xl font-bold mt-1">{roomData.length}</div>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-md border p-4">
            <div className="font-medium mb-3">Giao dịch theo ngày</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} />
                  <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={COLORS.line} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <div className="font-medium mb-3">Giao dịch theo phòng</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roomData}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="room" fontSize={12} tickLine={false} />
                  <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="count">
                    {roomData.map((_, idx) => <Cell key={idx} fill={COLORS.rooms[idx % COLORS.rooms.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-md border p-4 lg:col-span-2">
            <div className="font-medium mb-3">Tỉ lệ loại tác nghiệp</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={110}
                    label
                  >
                    {typeData.map((entry, index) => {
                      const color =
                        entry.name === "Xuất kho" ? COLORS.types["Xuất kho"]
                        : entry.name === "Mượn TS" ? COLORS.types["Mượn TS"]
                        : entry.name === "Thay bìa" ? COLORS.types["Thay bìa"]
                        : COLORS.types.other;
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsOverview;