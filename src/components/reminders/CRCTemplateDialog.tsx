"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const DEFAULT_TEMPLATE_CRC = `
<p>Kính gửi,</p>
<p>Nhắc duyệt CRC cho chứng từ: <strong>{{loai_bt_crc}}</strong> - ngày thực hiện: <strong>{{ngay_thuc_hien}}</strong>.</p>
{{so_chung_tu_line}}
{{ten_ts_line}}
<p>{{recipients_block}}</p>
<p>Trân trọng.</p>
`;

export function renderCRCTemplate(template: string, reminder: any, recipientsBlock: string) {
  const soLine = reminder?.so_chung_tu ? `<p>Số chứng từ: <strong>${reminder.so_chung_tu}</strong></p>` : "";
  const tsLine = reminder?.ten_ts ? `<p>Tên TS: <strong>${reminder.ten_ts}</strong></p>` : "";
  return template
    .replace("{{loai_bt_crc}}", String(reminder?.loai_bt_crc || ""))
    .replace("{{ngay_thuc_hien}}", String(reminder?.ngay_thuc_hien || ""))
    .replace("{{recipients_block}}", recipientsBlock || "")
    .replace("{{so_chung_tu_line}}", soLine)
    .replace("{{ten_ts_line}}", tsLine);
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: string;
  onTemplateChange: (v: string) => void;
  sampleReminder: any;
  recipientsBlock: string;
  currentUsername?: string | null;
};

const CRCTemplateDialog: React.FC<Props> = ({ open, onOpenChange, template, onTemplateChange, sampleReminder, recipientsBlock, currentUsername }) => {
  const previewHtml = renderCRCTemplate(template || DEFAULT_TEMPLATE_CRC, sampleReminder, recipientsBlock);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chỉnh mẫu email & Xem trước (CRC)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            rows={8}
            value={template}
            onChange={(e) => onTemplateChange(e.target.value)}
            placeholder="Nhập template với biến {{loai_bt_crc}}, {{ngay_thuc_hien}}, {{recipients_block}}, {{so_chung_tu_line}}, {{ten_ts_line}}"
          />
          <div className="border rounded-md p-3 bg-slate-50">
            <div className="text-sm font-medium mb-2">Preview</div>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onTemplateChange(DEFAULT_TEMPLATE_CRC);
                toast.success("Đã khôi phục mẫu mặc định");
              }}
            >
              Khôi phục mặc định
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                try {
                  window.localStorage.setItem("crc_reminder_email_template", template);
                  toast.success("Đã lưu mẫu email");
                } catch {
                  toast.error("Không thể lưu mẫu email");
                }
              }}
            >
              Lưu
            </Button>
            <Button
              onClick={() => {
                toast.success(`Đã gửi thử cho ${currentUsername || "tôi"}`);
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Gửi thử cho tôi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CRCTemplateDialog;