"use client";

import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Camera, Loader2 } from "lucide-react";
import { SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/env";

type SafeStaff = {
  id: string;
  username: string;
  staff_name: string;
  email: string | null;
  role: "admin" | "user";
  department: string | null;
  account_status: "active" | "locked";
};

type Props = {
  isAssetValid: (value: string) => boolean;
  setMultipleAssets: React.Dispatch<React.SetStateAction<string[]>>;
  currentStaff: SafeStaff | null;
  onNeedConfirm: (payload: { options: Record<string, string[]>; selections: Record<string, string> }) => void;
  setMessage: React.Dispatch<React.SetStateAction<{ type: "" | "success" | "error"; text: string }>>;
  autoOpen?: boolean;
};

type AiStatus = { stage: string; progress: number; total: number; detail: string };

const AssetEntryAIDialogLazy: React.FC<Props> = ({
  isAssetValid,
  setMultipleAssets,
  currentStaff,
  onNeedConfirm,
  setMessage,
  autoOpen = false,
}) => {
  const [open, setOpen] = React.useState<boolean>(autoOpen);
  const [pendingImages, setPendingImages] = React.useState<File[]>([]);
  const [isProcessingImage, setIsProcessingImage] = React.useState<boolean>(false);
  const [aiStatus, setAiStatus] = React.useState<AiStatus>({ stage: "", progress: 0, total: 0, detail: "" });
  const AI_MAX_IMAGES = 10;

  const compressImageToDataUrl = (file: File, maxDim = 1600, quality = 0.75): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img as HTMLImageElement;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(String(reader.result));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          try {
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            resolve(dataUrl);
          } catch {
            resolve(String(reader.result));
          }
        };
        img.onerror = () => resolve(String(reader.result));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error("Không đọc được file"));
      reader.readAsDataURL(file);
    });

  const addPendingFiles = React.useCallback((files: File[]) => {
    if (!files || files.length === 0) return;
    setPendingImages((prev) => {
      const room = AI_MAX_IMAGES - prev.length;
      if (room <= 0) {
        toast.error(`Tối đa ${AI_MAX_IMAGES} ảnh cho một lần nhập.`);
        return prev;
      }
      const toAdd = files.slice(0, room);
      const ignored = files.length - toAdd.length;
      if (ignored > 0) {
        toast.warning(`Đã đạt tối đa ${AI_MAX_IMAGES} ảnh. Bỏ qua ${ignored} ảnh.`);
      }
      return [...prev, ...toAdd];
    });
  }, []);

  const handleFileUpload = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      addPendingFiles(files);
      toast.success(`Đã thêm ${Math.min(files.length, AI_MAX_IMAGES)} ảnh vào danh sách.`);
    }
    event.target.value = "";
  }, [addPendingFiles]);

  const handlePasteFromClipboard = React.useCallback(async () => {
    try {
      const navAny = navigator as any;
      if (!navAny.clipboard || typeof navAny.clipboard.read !== "function") {
        toast.error("Trình duyệt không hỗ trợ dán ảnh từ clipboard.");
        return;
      }
      const items: any[] = await navAny.clipboard.read();
      const images: File[] = [];
      let idx = 0;
      for (const item of items) {
        for (const type of item.types || []) {
          if (String(type).startsWith("image/")) {
            const blob: Blob = await item.getType(type);
            const fname = `clipboard-${Date.now()}-${idx++}.${type.includes("png") ? "png" : (type.includes("webp") ? "webp" : "jpg")}`;
            images.push(new File([blob], fname, { type: blob.type }));
          }
        }
      }
      if (images.length === 0) {
        toast.error("Không tìm thấy ảnh trong clipboard.");
        return;
      }
      addPendingFiles(images);
      toast.success(`Đã dán ${images.length} ảnh từ clipboard.`);
    } catch (_e) {
      toast.error("Không thể đọc ảnh từ clipboard. Hãy cho phép quyền hoặc thử lại.");
    }
  }, [addPendingFiles]);

  const handleProcessPending = React.useCallback(async () => {
    if (pendingImages.length === 0) {
      toast.error("Chưa có ảnh nào trong danh sách.");
      return;
    }
    await processImages(pendingImages);
    setPendingImages([]);
  }, [pendingImages]);

  const processImages = React.useCallback(async (files: File[]) => {
    setIsProcessingImage(true);
    setAiStatus({ stage: "starting", progress: 0, total: files.length, detail: "Đang chuẩn bị xử lý hình ảnh..." });
    setMessage({ type: "", text: "" });
    try {
      const images: string[] = [];
      let index = 0;
      for (const file of files) {
        index += 1;
        setAiStatus({ stage: "uploading", progress: index - 1, total: files.length, detail: `Đang tối ưu ảnh ${index}/${files.length}...` });
        const dataUrl = await compressImageToDataUrl(file, 1600, 0.75);
        images.push(dataUrl);
        setAiStatus({ stage: "progress", progress: index, total: files.length, detail: `Đã nạp ${index}/${files.length} ảnh` });
      }

      setAiStatus({ stage: "extracting", progress: 0, total: files.length, detail: "Đang phân tích bằng AI..." });

      const { supabase } = await import("@/lib/supabase/client");
      const { data, error } = await supabase.functions.invoke("ai-extract-asset-codes", {
        body: { images, rate_limit_key: currentStaff?.username || "anon" },
        headers: { Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}` },
      });

      if (error) {
        setAiStatus({ stage: "error", progress: 0, total: files.length, detail: "AI lỗi khi phân tích hình ảnh." });
        setMessage({ type: "error", text: error.message || "AI lỗi khi phân tích hình ảnh." });
        return;
      }

      const payload: any = data?.data ?? data;
      const meta = payload?.meta || {};
      const abVariant = meta?.ab_variant || "";
      const modelName = meta?.model || "";
      const aiCodes: string[] = Array.isArray(payload?.codes) ? payload.codes : [];

      if (!aiCodes.length) {
        setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: "Không tìm thấy mã tài sản hợp lệ." });
        setMessage({ type: "error", text: "Không tìm thấy mã tài sản hợp lệ trong hình ảnh." });
        return;
      }

      const uniqueCodes = Array.from(new Set(aiCodes)).filter((formatted) => isAssetValid(formatted));
      if (!uniqueCodes.length) {
        setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: "Không tìm thấy mã hợp lệ theo định dạng." });
        setMessage({ type: "error", text: "Không tìm thấy mã hợp lệ theo định dạng X.YY." });
        return;
      }

      setMultipleAssets((prev) => {
        const existing = prev.filter((a) => a.trim());
        const merged = Array.from(new Set([...existing, ...uniqueCodes]));
        return merged.length > 0 ? merged : [""];
      });

      const needsCodes: string[] = Array.isArray(payload?.needs_confirmation?.codes) ? payload.needs_confirmation.codes : [];
      const needsOptions: Record<string, string[]> = payload?.needs_confirmation?.options || {};
      const needsCount = needsCodes.length;
      if (needsCount > 0) {
        const initialSelections: Record<string, string> = {};
        needsCodes.forEach((c) => {
          const opts = needsOptions[c] || [];
          if (opts.length > 0) initialSelections[c] = opts[0];
        });
        onNeedConfirm({ options: needsOptions, selections: initialSelections });
        setMessage({ type: "success", text: `Đã điền ${uniqueCodes.length} mã; có ${needsCount} mã cần xác nhận (${needsCodes.join(", ")}).` });
      } else {
        setMessage({ type: "success", text: `Đã điền ${uniqueCodes.length} mã tài sản.` });
      }

      setOpen(false);
      const modelInfo = modelName ? ` • Model: ${modelName}${abVariant ? ` (${abVariant})` : ""}` : "";
      setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: `Đã điền ${uniqueCodes.length} mã tài sản.${modelInfo}` });
    } catch (_err) {
      setAiStatus({ stage: "error", progress: 0, total: 0, detail: "Có lỗi xảy ra khi xử lý hình ảnh." });
      setMessage({ type: "error", text: "Có lỗi xảy ra khi xử lý hình ảnh!" });
    } finally {
      setIsProcessingImage(false);
      setTimeout(() => setAiStatus({ stage: "", progress: 0, total: 0, detail: "" }), 1200);
    }
  }, [isAssetValid, currentStaff, onNeedConfirm, setMessage]);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPendingImages([]); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Chọn cách nhập hình ảnh</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              <Button onClick={() => document.getElementById("file-input-lazy")?.click()} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                <Upload className="w-5 h-5" /> Upload từ thiết bị
              </Button>
              <Button onClick={() => document.getElementById("camera-input-lazy")?.click()} className="w-full h-12 bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                <Camera className="w-5 h-5" /> Chụp ảnh
              </Button>
              <Button onClick={handlePasteFromClipboard} className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2" disabled={isProcessingImage}>
                <Upload className="w-5 h-5" /> Dán ảnh từ clipboard
              </Button>
            </div>

            {(pendingImages.length > 0) && (
              <div className="p-3 rounded-md border bg-slate-50 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Đã chọn {pendingImages.length}/{AI_MAX_IMAGES} ảnh</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingImages([])}
                    disabled={isProcessingImage}
                  >
                    Xóa danh sách
                  </Button>
                </div>
                <div className="max-h-40 overflow-auto space-y-1">
                  {pendingImages.map((f, i) => (
                    <div key={i} className="truncate">{f.name || `Ảnh ${i + 1}`}</div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={handleProcessPending}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={isProcessingImage || pendingImages.length === 0}
                  >
                    Nhập dữ liệu
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPendingImages([])}
                    disabled={isProcessingImage}
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            )}

            {(isProcessingImage || aiStatus.stage) && (
              <div className="p-3 rounded-md border bg-slate-50 text-sm flex items-start gap-3">
                <Loader2 className={`w-4 h-4 mt-0.5 ${isProcessingImage ? "animate-spin" : ""}`} />
                <div>
                  <div className="font-medium">{aiStatus.detail || "Đang xử lý..."}</div>
                  {aiStatus.total > 0 && (
                    <div className="mt-2 h-2 bg-slate-200 rounded">
                      <div className="h-2 bg-green-600 rounded" style={{ width: `${Math.min(100, Math.round((aiStatus.progress / Math.max(aiStatus.total, 1)) * 100))}%` }}></div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <input id="file-input-lazy" type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
      <input id="camera-input-lazy" type="file" accept="image/*" multiple capture="environment" onChange={handleFileUpload} className="hidden" />
    </>
  );
};

export default AssetEntryAIDialogLazy;