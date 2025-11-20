"use client";

import React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { edgeInvoke, friendlyErrorMessage } from "@/lib/edge-invoke";

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

const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"] as const;
const TYPES = ["Xuất kho", "Mượn TS", "Thay bìa"] as const;

function toDateFromYmd(ymd: string): Date {
  // ymd is yyyy-MM-dd
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  return new Date(y, (m - 1), d);
}
function formatDDMMYYYY(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}
function formatYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction: AssetTx;
  editorUsername: string;
  onUpdated?: (updated: AssetTx) => void;
};

export default function EditTransactionDialog({ open, onOpenChange, transaction, editorUsername, onUpdated }: Props) {
  const [txDate, setTxDate] = React.useState<Date>(() => toDateFromYmd(transaction.transaction_date));
  const [partsDay, setPartsDay] = React.useState<"Sáng" | "Chiều">(transaction.parts_day);
  const [room, setRoom] = React.useState<string>(transaction.room);
  const [txType, setTxType] = React.useState<"Xuất kho" | "Mượn TS" | "Thay bìa">(transaction.transaction_type);
  const [assetYear, setAssetYear] = React.useState<number>(transaction.asset_year);
  const [assetCode, setAssetCode] = React.useState<number>(transaction.asset_code);
  const [note, setNote] = React.useState<string>(transaction.note ?? "");

  const handleUpdate = React.useCallback(async () => {
    const patch = {
      transaction_date: formatYMD(txDate),
      parts_day: partsDay,
      room,
      transaction_type: txType,
      asset_year: assetYear,
      asset_code: assetCode,
      note: note || "",
    };
    const res = await edgeInvoke<AssetTx>("asset-transactions", {
      action: "update_transaction",
      id: transaction.id,
      patch,
      editor_username: editorUsername || "unknown",
    });
    if (!res.ok) {
      toast.error(friendlyErrorMessage(res.error));
      return;
    }
    const updated = (res.data as any) as AssetTx;
    toast.success("Cập nhật giao dịch thành công!");
    onOpenChange(false);
    onUpdated?.(updated);
  }, [txDate, partsDay, room, txType, assetYear, assetCode, note, transaction.id, editorUsername, onOpenChange, onUpdated]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Chỉnh sửa giao dịch</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Ngày giao dịch</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start w-full h-10">
                  {formatDDMMYYYY(txDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-2">
                <Calendar
                  mode="single"
                  selected={txDate}
                  onSelect={(d) => d && setTxDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Buổi</Label>
            <Select value={partsDay} onValueChange={(v) => setPartsDay(v as "Sáng" | "Chiều")}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Chọn buổi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Sáng">Sáng</SelectItem>
                <SelectItem value="Chiều">Chiều</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Phòng</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
              <SelectContent>
                {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Loại tác nghiệp</Label>
            <Select value={txType} onValueChange={(v) => setTxType(v as any)}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Chọn loại" /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Năm TS</Label>
            <Input
              type="number"
              value={assetYear}
              onChange={(e) => setAssetYear(parseInt(e.target.value || "0", 10))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mã TS</Label>
            <Input
              type="number"
              value={assetCode}
              onChange={(e) => setAssetCode(parseInt(e.target.value || "0", 10))}
            />
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <Label>Ghi chú</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhập ghi chú..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleUpdate}>Cập nhật</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}