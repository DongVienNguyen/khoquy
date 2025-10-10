"use client";

import React from "react";
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

const Item: React.FC<{ a: OtherAsset; canShowHistory?: boolean; count?: number; onEdit: any; onDelete: any; onHistory: any }> = ({ a, canShowHistory, count, onEdit, onDelete, onHistory }) => (
  <div className="rounded-lg border p-4 shadow-sm bg-white">
    <div className="flex justify-between items-start">
      <div className="font-semibold">{a.name}</div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-violet-600" onClick={() => onEdit(a)} title="Chỉnh sửa">
          <Edit className="h-4 w-4" />
        </Button>
        {canShowHistory && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => onHistory(a)} title="Lịch sử">
            <History className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => onDelete(a)} title="Xóa">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600">
      <div><span className="font-medium text-slate-700">Ngày gửi:</span> {a.deposit_date ? format(new Date(a.deposit_date), "dd/MM/yyyy") : "-"}</div>
      <div><span className="font-medium text-slate-700">Ngày xuất:</span> {a.withdrawal_date ? format(new Date(a.withdrawal_date), "dd/MM/yyyy") : "-"}</div>
      <div><span className="font-medium text-slate-700">Người gửi:</span> {a.depositor || "-"}</div>
      <div><span className="font-medium text-slate-700">Người nhận (gửi):</span> {a.deposit_receiver || "-"}</div>
      <div><span className="font-medium text-slate-700">Người giao (xuất):</span> {a.withdrawal_deliverer || "-"}</div>
      <div><span className="font-medium text-slate-700">Người nhận (xuất):</span> {a.withdrawal_receiver || "-"}</div>
    </div>
    {canShowHistory && (count ?? 0) > 0 && (
      <button className="mt-2 text-xs text-blue-600 underline underline-offset-2" onClick={() => onHistory(a)}>
        {count} lịch sử
      </button>
    )}
    {a.notes && <div className="mt-2 text-sm whitespace-pre-wrap">{a.notes}</div>}
  </div>
);

const OtherAssetCardList: React.FC<Props> = (props) => {
  const { assets, isLoading, emptyText } = props;
  if (isLoading) return <div className="text-center text-slate-500 py-6">Đang tải...</div>;
  if (!assets || assets.length === 0) return <div className="text-center text-slate-500 py-6">{emptyText || "Không có dữ liệu"}</div>;
  return (
    <div className="space-y-3">
      {assets.map((a) => (
        <Item
          key={a.id}
          a={a}
          canShowHistory={props.canShowHistory}
          count={props.assetHistoryCount?.[a.id] ?? 0}
          onEdit={props.onEdit}
          onDelete={props.onDeleteRequest}
          onHistory={props.onShowHistory}
        />
      ))}
    </div>
  );
};

export default OtherAssetCardList;