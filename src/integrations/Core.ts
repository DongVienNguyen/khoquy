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

// Helpers cho extractor nâng cao
const countNonEmptyLines = (text: string): number => {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
};

const normalizeAndSortCodes = (codes: string[]): string[] => {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const normalized = new Set<string>();
  for (const c of codes) {
    const parts = String(c).trim().split(".");
    if (parts.length !== 2) continue;
    const codeNum = parseInt(parts[0], 10);
    const yearNum = parseInt(parts[1], 10);
    if (!Number.isFinite(codeNum) || codeNum < 1 || codeNum > 9999) continue;
    if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) continue;
    normalized.add(`${codeNum}.${String(yearNum).padStart(2, "0")}`);
  }
  const out = Array.from(normalized);
  out.sort((a, b) => {
    const [ca, ya] = a.split(".");
    const [cb, yb] = b.split(".");
    const byYear = ya.localeCompare(yb);
    return byYear !== 0 ? byYear : parseInt(ca, 10) - parseInt(cb, 10);
  });
  return out;
};

const extractCodesFromLongSequences = (text: string): string[] => {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const sequences = raw.replace(/\D+/g, " ").split(/\s+/).filter(Boolean);
  const found = new Set<string>();
  for (const s of sequences) {
    if (s.length < 12) continue;
    const year = s.slice(-10, -8);
    const codeRaw = s.slice(-4);
    const codeNum = parseInt(codeRaw, 10);
    const yearNum = parseInt(year, 10);
    if (!Number.isFinite(codeNum) || codeNum <= 0) continue;
    if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) continue;
    const code = String(codeNum);
    const formatted = `${code}.${String(yearNum).padStart(2, "0")}`;
    if (/^\d{1,4}\.\d{2}$/.test(formatted)) found.add(formatted);
  }
  return Array.from(found);
};

const extractAssetCodesFromText = (text: string): string[] => {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const directMatches = raw.match(/\b(\d{1,4}\.\d{2})\b/g) || [];
  const derived = extractCodesFromLongSequences(raw);
  return normalizeAndSortCodes([...directMatches, ...derived]);
};

export async function ExtractDataFromUploadedFile({ file_url }: ExtractParams): Promise<ExtractResult> {
  const blob = uploadedFilesMap.get(file_url);
  try {
    const ocrOptions = {
      tessedit_char_whitelist: "0123456789.",
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "6",
      user_defined_dpi: "300",
    } as any;
    const { data } = await Tesseract.recognize(blob ?? file_url, "eng", ocrOptions);
    const text_content = (data?.text || "").toString();
    return { status: "success", output: { text_content } };
  } catch (e: any) {
    return { status: "error", error: e?.message || "OCR failed" };
  }
}

// Hàm mới: trả về text + lines_count + danh sách codes đã chuẩn hóa (không suy luận room)
export type ExtractAssetDataResult =
  | { status: "success"; output: { text_content: string; lines_count: number; codes: string[] } }
  | { status: "error"; error: string };

export async function ExtractAssetDataFromUploadedFile({ file_url }: ExtractParams): Promise<ExtractAssetDataResult> {
  const blob = uploadedFilesMap.get(file_url);
  try {
    const ocrOptions = {
      tessedit_char_whitelist: "0123456789.",
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "6",
      user_defined_dpi: "300",
    } as any;
    const { data } = await Tesseract.recognize(blob ?? file_url, "eng", ocrOptions);
    const text = (data?.text || "").toString();
    const lines_count = countNonEmptyLines(text);
    const codes = extractAssetCodesFromText(text);
    return { status: "success", output: { text_content: text, lines_count, codes } };
  } catch (e: any) {
    return { status: "error", error: e?.message || "OCR failed" };
  }
}