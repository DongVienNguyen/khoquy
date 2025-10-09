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
  | {
      status: "success";
      output: {
        text_content: string;
        codes?: string[];
        stats?: {
          totalLines: number;
          keptLines: number;
          avgConfidence?: number;
          durationMs: number;
          droppedIndices?: number[];
        };
      };
    }
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

    // result.codes là chuỗi bắt đầu bằng "042..."; chuẩn hóa sang "code.year"
    const formattedCodes = (result.codes || [])
      .map((seq) => formatFromSequence(seq))
      .filter((v): v is string => !!v);

    const text_content = formattedCodes.join("\n");

    return {
      status: "success",
      output: {
        text_content,
        codes: formattedCodes,
        stats: {
          totalLines: result.stats.totalLines,
          keptLines: result.stats.keptLines,
          avgConfidence: result.stats.avgConfidence,
          durationMs: result.stats.durationMs,
          droppedIndices: result.stats.droppedIndices,
        },
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
      const rawMatches = text.match(/042\d{9,14}/g) || [];

      const formattedCodes = rawMatches
        .map((seq) => formatFromSequence(seq))
        .filter((v): v is string => !!v);

      return {
        status: "success",
        output: {
          text_content: formattedCodes.join("\n") || text,
          codes: formattedCodes.length ? formattedCodes : undefined,
          stats: {
            totalLines: rawMatches.length,
            keptLines: formattedCodes.length,
            avgConfidence: undefined,
            durationMs: 0,
            droppedIndices: [],
          },
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