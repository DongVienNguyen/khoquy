"use client";

import Tesseract from "tesseract.js";
import { detectCodesFromImage, warmUpOcr } from "./ocr/pipeline.ts";

type UploadFileParams = { file: File };
type UploadFileResult = { file_url: string };

type ExtractParams = { file_url: string; json_schema?: Record<string, any> };
type ExtractResult =
  | { status: "success"; output: { text_content: string; codes?: string[]; detected_room?: string } }
  | { status: "error"; error: string };

// Lưu trữ tạm thời mapping giữa object URL và File để OCR chính xác từ blob.
const uploadedFilesMap = new Map<string, File>();

export async function UploadFile({ file }: UploadFileParams): Promise<UploadFileResult> {
  const url = URL.createObjectURL(file);
  uploadedFilesMap.set(url, file);
  return { file_url: url };
}

// Warm up Tesseract in background when module loads (reduce first-call latency)
void warmUpOcr().catch(() => {});

export async function ExtractDataFromUploadedFile({ file_url }: ExtractParams): Promise<ExtractResult> {
  const blob = uploadedFilesMap.get(file_url);

  try {
    // Prefer our pipeline (handles preprocessing, line segmentation, ensemble OCR, voting, business parsing)
    const result = await detectCodesFromImage(blob ?? file_url);

    // Keep backward compatibility: return newline-joined codes as text_content
    const text_content = (result.codes || []).join("\n");

    return {
      status: "success",
      output: {
        text_content,
        codes: result.codes,
        detected_room: result.detectedRoom,
      },
    };
  } catch (e: any) {
    // Fallback to a plain Tesseract call as a safety net
    try {
      const ocrOptions = {
        tessedit_char_whitelist: "0123456789",
        preserve_interword_spaces: "0",
        user_defined_dpi: "300",
        tessedit_pageseg_mode: "11",
        psm: "11",
      } as any;
      const { data } = await Tesseract.recognize(blob ?? file_url, "eng", ocrOptions);
      const text_content = (data?.text || "").toString();
      return { status: "success", output: { text_content } };
    } catch (inner: any) {
      return { status: "error", error: inner?.message || e?.message || "OCR failed" };
    }
  } finally {
    // Do not revoke immediately because UI might reuse; if needed later:
    // if (blob) URL.revokeObjectURL(file_url);
  }
}