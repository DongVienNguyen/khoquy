"use client";

import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, History, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { OtherAsset } from "@/entities/OtherAsset";

type Props = {
  assets: OtherAsset[];
  isLoading?: boolean;
  emptyText?: string;
  canShowHistory?: boolean;
  assetHistoryCount?: Record<string, number>;
  onEdit: (asset: OtherAsset) => void;
  onDeleteRequest: (asset: OtherAsset) => void;
  onShowHistory: (asset: OtherAsset) => void;
};

const OtherAssetListTable: React.FC<Props> = ({
  assets,
  isLoading,
  emptyText,
  canShowHistory,
  assetHistoryCount,
  onEdit,
  onDeleteRequest,
  onShowHistory,
}) => {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên tài sản</TableHead>
            <TableHead>Ngày gửi</TableHead>
            <TableHead>Người gửi</TableHead>
            <TableHead>Người nhận (gửi)</TableHead>
            <TableHead>Ngày xuất</TableHead>
            <TableHead>Người giao (xuất)</TableHead>
            <TableHead>Người nhận (xuất)</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead>Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-slate-500">Đang tải...</TableCell>
            </TableRow>
          ) : assets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-slate-500">{emptyText || "Không có dữ liệu"}</TableCell>
            </TableRow>
          ) : (
            assets.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{a.name}</span>
                    {canShowHistory && (assetHistoryCount?.[a.id] ?? 0) > 0 && (
                      <button
                        className="text-xs text-blue-600 underline underline-offset-2"
                        onClick={() => onShowHistory(a)}
                        title="Xem lịch sử thay đổi"
                      >
                        {(assetHistoryCount?.[a.id] ?? 0)} lịch sử
                      </button>
                    )}
                  </div>
                </TableCell>
                <TableCell>{a.deposit_date ? format(new Date(a.deposit_date), "dd/MM/yyyy") : "-"}</TableCell>
                <TableCell>{a.depositor || "-"}</TableCell>
                <TableCell>{a.deposit_receiver || "-"}</TableCell>
                <TableCell>{a.withdrawal_date ? format(new Date(a.withdrawal_date), "dd/MM/yyyy") : "-"}</TableCell>
                <TableCell>{a.withdrawal_deliverer || "-"}</TableCell>
                <TableCell>{a.withdrawal_receiver || "-"}</TableCell>
                <TableCell className="whitespace-pre-wrap">{a.notes || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-violet-600 hover:bg-violet-50" onClick={() => onEdit(a)} title="Chỉnh sửa">
                      <Edit className="h-4 w-4" />
                    </Button>
                    {canShowHistory && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => onShowHistory(a)} title="Lịch sử">
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => onDeleteRequest(a)} title="Xóa">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default OtherAssetListTable;