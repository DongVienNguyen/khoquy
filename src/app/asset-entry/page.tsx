"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";
import {
  Plus,
  Minus,
  CalendarDays,
  Building2,
  Camera,
  BrainCircuit,
  RefreshCcw,
  Edit3,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

type NotificationRow = {
  id: number;
  room: string;
  asset_year: number;
  asset_code: number;
  operation: "Xuất kho" | "Mượn TS" | "Thay bia";
  session: "Sáng" | "Chiều";
  date: string; // YYYY-MM-DD
  note: string | null;
  user_id: string;
  created_at: string;
};

const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"] as const;
const OPS = ["Xuất kho", "Mượn TS", "Thay bia"] as const;
const SESSIONS = ["Sáng", "Chiều"] as const;

export default function AssetEntryPage() {
  const router = useRouter();

  const [room, setRoom] = useState<string>("");
  const [assets, setAssets] = useState<string[]>([""]);
  const [operation, setOperation] = useState<typeof OPS[number] | "">("");
  const [session, setSession] = useState<typeof SESSIONS[number]>("Sáng");
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [note, setNote] = useState<string>("");

  const [myRows, setMyRows] = useState<NotificationRow[]>([]);
  const [listOpen, setListOpen] = useState<boolean>(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/sign-in");
      } else {
        fetchMyNotifications();
      }
    });
  }, [router]);

  const addAssetRow = () => setAssets((prev) => [...prev, ""]);
  const removeAssetRow = (index: number) =>
    setAssets((prev) => prev.filter((_, i) => i !== index));

  const parseAsset = (value: string) => {
    // value format: "MãTS.NămTS", accept dot or comma
    const normalized = value.replace(",", ".").trim();
    const parts = normalized.split(".");
    if (parts.length !== 2) return null;
    const code = Number(parts[0]);
    const year = Number(parts[1]);
    if (!Number.isFinite(code) || !Number.isFinite(year)) return null;
    return { code, year };
  };

  const canSubmit = useMemo(() => {
    const hasValidAssets = assets.some((v) => parseAsset(v) !== null);
    return !!room && !!operation && hasValidAssets && !!date && !!session;
  }, [room, operation, assets, date, session]);

  const clearForm = () => {
    setRoom("");
    setAssets([""]);
    setOperation("");
    setSession("Sáng");
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setDate(`${yyyy}-${mm}-${dd}`);
    setNote("");
  };

  const fetchMyNotifications = async () => {
    const { data: sessionData } = await supabase.auth.getUser();
    if (!sessionData.user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", sessionData.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }
    setMyRows((data as NotificationRow[]) || []);
  };

  const submit = async () => {
    const { data: sessionData } = await supabase.auth.getUser();
    if (!sessionData.user) {
      toast.error("Vui lòng đăng nhập");
      router.replace("/sign-in");
      return;
    }

    const rowsToInsert = assets
      .map(parseAsset)
      .filter(Boolean)
      .map((a) => ({
        room,
        asset_year: (a as { year: number }).year,
        asset_code: (a as { code: number }).code,
        operation,
        session,
        date,
        note: note || null,
        user_id: sessionData.user!.id,
      }));

    if (rowsToInsert.length === 0) {
      toast.error("Vui lòng nhập ít nhất một [Mã TS].[Năm TS] hợp lệ");
      return;
    }

    const { error } = await supabase
      .from("notifications")
      .insert(rowsToInsert);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Đã gửi thông báo");
    clearForm();
    fetchMyNotifications();
  };

  const removeNotification = async (id: number) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa thông báo");
    setMyRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="w-full">
      <SonnerToaster />
      <div className="mx-auto max-w-3xl p-4 space-y-4">
        <div className="rounded-lg bg-card border p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">Thông báo Mượn/Xuất</h1>
              <p className="text-muted-foreground mt-1">Không giới hạn thời gian cho Admin</p>
            </div>
          </div>

          <div className="mt-6 rounded-md bg-green-50 text-green-700 p-3 text-sm">
            Từ Phái sang Trái: 2 ký tự thứ 9 và 10 là Năm TS; 24; 4 ký tự cuối là Mã TS: 259 - vd: 0424102470200259
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <Building2 className="text-muted-foreground" size={18} />
                Tài sản của phòng
              </label>
              <div className="relative">
                <select
                  className="w-full h-10 rounded-md border bg-background px-3"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                >
                  <option value="">Chọn phòng</option>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Nhập [Mã TS] . [Năm TS]: Có dấu CHẤM (hoặc PHẨY) ở giữa.
                </label>
                <div className="flex items-center gap-1 text-green-600">
                  <Camera size={18} />
                  <span className="text-sm">AI</span>
                </div>
              </div>
              {assets.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={val}
                    onChange={(e) => setAssets((prev) => prev.map((p, i) => i === idx ? e.target.value : p))}
                    placeholder="Ví dụ: 259.24"
                    className="flex-1 h-10 rounded-md border bg-background px-3"
                  />
                  <button
                    type="button"
                    onClick={addAssetRow}
                    className="h-9 w-9 rounded-full border border-green-600 text-green-600 flex items-center justify-center hover:bg-green-50"
                    aria-label="Thêm dòng"
                  >
                    <Plus size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAssetRow(idx)}
                    className="h-9 w-9 rounded-full border border-red-600 text-red-600 flex items-center justify-center hover:bg-red-50"
                    aria-label="Xóa dòng"
                  >
                    <Minus size={18} />
                  </button>
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Loại tác nghiệp Xuất/Mượn/Thay bia</label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3"
                value={operation}
                onChange={(e) => setOperation(e.target.value as typeof OPS[number])}
              >
                <option value="">Chọn Mượn/Xuất TS/Thay bia</option>
                {OPS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <CalendarDays className="text-muted-foreground" size={18} />
                  Buổi
                </label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3"
                  value={session}
                  onChange={(e) => setSession(e.target.value as typeof SESSIONS[number])}
                >
                  {SESSIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <CalendarDays className="text-muted-foreground" size={18} />
                  Ngày lấy TS
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-10 rounded-md border bg-background px-3"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Ghi chú (tuỳ chọn)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Ship PGD"
                className="w-full h-10 rounded-md border bg-background px-3"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={clearForm}
                className="h-10 rounded-md border px-4 bg-background hover:bg-muted"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="h-10 rounded-md px-4 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Gửi thông báo
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-card border p-6 shadow-sm">
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setListOpen((o) => !o)}
          >
            <span className="font-semibold">Thông báo đã gửi của tôi</span>
            <span className="text-muted-foreground">{listOpen ? "Thu gọn" : "Mở"}</span>
          </button>

          {listOpen && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  Hiển thị các thông báo bạn đã tạo và còn hiệu lực đến ngày lấy.
                </p>
                <button
                  onClick={fetchMyNotifications}
                  className="flex items-center gap-2 h-9 rounded-md border px-3 bg-background hover:bg-muted"
                >
                  <RefreshCcw size={16} />
                  Làm mới
                </button>
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
                    {myRows.length === 0 ? (
                      <tr>
                        <td className="py-3 px-3 text-muted-foreground" colSpan={8}>
                          Chưa có thông báo nào.
                        </td>
                      </tr>
                    ) : (
                      myRows.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="py-2 px-3">{r.room}</td>
                          <td className="py-2 px-3">{r.asset_year}</td>
                          <td className="py-2 px-3">{r.asset_code}</td>
                          <td className="py-2 px-3">{r.operation}</td>
                          <td className="py-2 px-3">
                            {new Date(r.date).toLocaleDateString("vi-VN")}
                          </td>
                          <td className="py-2 px-3">{r.session}</td>
                          <td className="py-2 px-3">{r.note ?? ""}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <button
                                title="Sửa (ghi chú)"
                                className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-muted"
                                onClick={async () => {
                                  const newNote = prompt("Nhập ghi chú mới", r.note ?? "");
                                  if (newNote === null) return;
                                  const { error } = await supabase
                                    .from("notifications")
                                    .update({ note: newNote })
                                    .eq("id", r.id);
                                  if (error) {
                                    toast.error(error.message);
                                    return;
                                  }
                                  toast.success("Đã cập nhật");
                                  setMyRows((prev) =>
                                    prev.map((x) => (x.id === r.id ? { ...x, note: newNote } : x))
                                  );
                                }}
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                title="Xóa"
                                className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-muted"
                                onClick={() => removeNotification(r.id)}
                              >
                                <Trash2 size={16} />
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
          )}
        </div>
      </div>
    </div>
  );
}