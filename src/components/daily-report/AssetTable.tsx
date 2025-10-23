"use client";

import React from "react";
import { format } from "date-fns";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

type AssetRow = {
  id: string;
  room: string;
  asset_year: number;
  asset_code: number;
  transaction_type: "Xuất kho" | "Mượn TS" | "Thay bìa";
  transaction_date: string;
  parts_day: "Sáng" | "Chiều";
  note: string | null;
  staff_code: string;
  notified_at: string;
  is_deleted: boolean;
  change_logs?: any[];
  // bổ sung để tương thích với kiểu rộng hơn ở page.tsx
  created_date?: string;
  updated_date?: string;
};

interface AssetTableProps {
  items: AssetRow[];
  canSeeTakenColumn: boolean;
  takenTransactionIds: Set<string>;
  isLoading: boolean;
  onToggleTakenStatus: (id: string) => void;
  onEditTransaction: (t: any) => void;
  onDeleteTransaction: (id: string) => void;
  formatGmt7TimeNhan: (iso?: string | null) => string;
  latestChangeSuffix: (logs?: any[]) => string;
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

const AssetTable: React.FC<AssetTableProps> = ({
  items,
  canSeeTakenColumn,
  takenTransactionIds,
  isLoading,
  onToggleTakenStatus,
  onEditTransaction,
  onDeleteTransaction,
  formatGmt7TimeNhan,
  latestChangeSuffix,
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}) => {
  const totalPages = Math.ceil(Math.max(0, totalItems) / Math.max(1, itemsPerPage));

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canSeeTakenColumn && <TableHead>Đã lấy</TableHead>}
              <TableHead>Phòng</TableHead>
              <TableHead>Năm TS</TableHead>
              <TableHead>Mã TS</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Ngày</TableHead>
              <TableHead>Buổi</TableHead>
              <TableHead>Ghi chú</TableHead>
              <TableHead>CB</TableHead>
              <TableHead>Time nhắn</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={canSeeTakenColumn ? 11 : 10} className="h-24 text-center text-muted-foreground">
                  Đang tải dữ liệu...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canSeeTakenColumn ? 11 : 10} className="h-24 text-center text-muted-foreground">
                  Không có dữ liệu.
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id}>
                  {canSeeTakenColumn && (
                    <TableCell>
                      <Switch
                        checked={takenTransactionIds.has(t.id)}
                        onCheckedChange={() => onToggleTakenStatus(t.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>{t.room}</TableCell>
                  <TableCell>{t.asset_year}</TableCell>
                  <TableCell>{t.asset_code}</TableCell>
                  <TableCell>{t.transaction_type}</TableCell>
                  <TableCell>{format(new Date(t.transaction_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{t.parts_day}</TableCell>
                  <TableCell>{t.note || "-"}</TableCell>
                  <TableCell>{t.staff_code}</TableCell>
                  <TableCell>{formatGmt7TimeNhan(t.notified_at)}{latestChangeSuffix(t.change_logs)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => onEditTransaction(t)}>
                        <Edit className="w-4 h-4 mr-1" /> Sửa
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onDeleteTransaction(t.id)}>
                        <Trash2 className="w-4 h-4 mr-1" /> Xóa
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalItems > itemsPerPage && (
        <div className="flex justify-center items-center gap-4 p-4">
          <Button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            variant="outline"
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" /> Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {currentPage} / {totalPages}
          </span>
          <Button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            variant="outline"
            className="gap-2"
          >
            Tiếp <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </>
  );
};

export default AssetTable;