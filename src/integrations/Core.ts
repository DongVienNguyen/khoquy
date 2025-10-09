"use client";

import Tesseract from "tesseract.js";

type UploadFileParams = { file: File };
type UploadFileResult = { file_url: string };

type ExtractParams = { file_url: string; json_schema?: Record<string, any> };
type ExtractResult =
  | { status: "success"; output: { text_content: string } }
  | { status: "error"; error: string };

// Lưu trữ tạm thời mapping giữa object URL và File để OCR chính xác từ blob.
const uploadedFilesMap = new Map<string, File>();

export async function UploadFile({ file }: UploadFileParams): Promise<UploadFileResult> {
  const url = URL.createObjectURL(file);
  uploadedFilesMap.set(url, file);
  return { file_url: url };
}

export async function ExtractDataFromUploadedFile({ file_url }: ExtractParams): Promise<ExtractResult> {
  const blob = uploadedFilesMap.get(file_url);
  try {
    const ocrOptions = {
      tessedit_char_whitelist: "0123456789",
      preserve_interword_spaces: "1",
    } as any;
    const { data } = await Tesseract.recognize(blob ?? file_url, "eng", ocrOptions);
    const text_content = (data?.text || "").toString();
    return { status: "success", output: { text_content } };
  } catch (e: any) {
    return { status: "error", error: e?.message || "OCR failed" };
  }
}