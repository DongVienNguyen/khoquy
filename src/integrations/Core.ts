"use client";

import Tesseract from "tesseract.js";
import { detectCodesFromImage, warmUpOcr } from "./ocr/pipeline.ts";
import type { OCRProgress } from "./ocr/pipeline.ts";

type UploadFileParams = { file: File };
type UploadFileResult = { file_url: string };

type ExtractParams = { file_url: string; json_schema?: Record<string, any> };
type ExtractOptions = {
  onProgress?: (p: OCRProgress) => void;
  turbo?: boolean;
  batchSize?: number;
  maxLines?: number;
};
type ExtractResult =
  | { status: "success"; output: { text_content: string; codes?: string[]; detected_room?: string } }
  | { status: "error"; error: string };

// Lưu trữ tạm thời mapping giữa object URL và File để OCR chính xác từ blob.
const uploadedFilesMap = new Map<string, File>();

// Helper chuyển chuỗi tiền tố nội bộ (0423/0424...) thành "mã.năm" (ví dụ 259.24)
function formatFromSequence(seq: string): string | null {
  const s = (seq || "").trim();
  if (!s || s.length < 10) return null;
  const year = s.slice(-10, -8);
  const code = parseInt(s.slice(-4), 10);
  if (Number.isNaN(code) || year.length !== 2) return null;
  const formatted = `${code}.${year}`;
  return /^\d{1,4}\.\d{2}$/.test(formatted) ? formatted : null;
}

function detectRoomFromPrefix(seq: string): string | "" {
  const p7 = seq.slice(0, 7);
  const p6 = seq.slice(0, 6);
  if (p7 === "0424201") return "CMT8";
  if (p7 === "0424202") return "NS";
  if (p7 === "0424203") return "ĐS";
  if (p7 === "0424204") return "LĐH";
  if (p6 === "042300") return "DVKH";
  if (p6 === "042410") return "QLN";
  return "";
}

export async function UploadFile({ file }: UploadFileParams): Promise<UploadFileResult> {
  const url = URL.createObjectURL(file);
  uploadedFilesMap.set(url, file);
  return { file_url: url };
}

// Warm up Tesseract in background when module loads (reduce first-call latency)
void warmUpOcr().catch(() => {});

export async function ExtractDataFromUploadedFile(
  { file_url }: ExtractParams,
  options?: ExtractOptions
): Promise<ExtractResult> {
  const blob = uploadedFilesMap.get(file_url);

  try {
    // Prefer our pipeline (handles preprocessing, line segmentation, ensemble OCR, voting)
    const result = await detectCodesFromImage(blob ?? file_url, {
      onProgress: options?.onProgress,
      turbo: options?.turbo,
      batchSize: options?.batchSize,
      maxLines: options?.maxLines,
    });

    // result.codes là chuỗi tiền tố nội bộ (0423/0424...); chuẩn hóa sang "code.year"
    const formattedCodes = (result.codes || [])
      .map((seq) => formatFromSequence(seq))
      .filter((v): v is string => !!v);

    // Chọn room: ưu tiên room từ pipeline, fallback vote theo codes
    let room = result.detectedRoom || "";
    if (!room && result.codes && result.codes.length > 0) {
      const votes = new Map<string, number>();
      for (const seq of result.codes) {
        const r = detectRoomFromPrefix(seq);
        if (r) votes.set(r, (votes.get(r) || 0) + 1);
      }
      for (const [r, cnt] of votes.entries()) {
        if (!room || cnt > (votes.get(room) || 0)) room = r;
      }
    }

    const text_content = formattedCodes.join("\n");

    return {
      status: "success",
      output: {
        text_content,
        codes: formattedCodes,
        detected_room: room || undefined,
      },
    };
  } catch (e: any) {
    // Fallback: plain Tesseract OCR + regex
    try {
      const ocrOptions = {
        tessedit_char_whitelist: "0123456789",
        preserve_interword_spaces: "0",
        user_defined_dpi: "300",
        tessedit_pageseg_mode: "11",
        psm: "11",
      } as any;
      const { data } = await Tesseract.recognize(blob ?? file_url, "eng", ocrOptions);
      const text = (data?.text || "").toString();
      const rawMatches = text.match(/(0424\d+|0423\d+)/g) || [];

      const formattedCodes = rawMatches
        .map((seq) => formatFromSequence(seq))
        .filter((v): v is string => !!v);

      let room = "";
      if (rawMatches.length > 0) {
        const votes = new Map<string, number>();
        for (const seq of rawMatches) {
          const r = detectRoomFromPrefix(seq);
          if (r) votes.set(r, (votes.get(r) || 0) + 1);
        }
        for (const [r, cnt] of votes.entries()) {
          if (!room || cnt > (votes.get(room) || 0)) room = r;
        }
      }

      return {
        status: "success",
        output: {
          text_content: formattedCodes.join("\n") || text,
          codes: formattedCodes.length ? formattedCodes : undefined,
          detected_room: room || undefined,
        },
      };
    } catch (inner: any) {
      return { status: "error", error: inner?.message || e?.message || "OCR failed" };
    }
  } finally {
    // Do not revoke immediately because UI might reuse; if needed later:
    // if (blob) URL.revokeObjectURL(file_url);
  }
}