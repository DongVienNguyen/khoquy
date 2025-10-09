"use client";

import Tesseract from "tesseract.js";

type OCRCandidate = {
  raw: string;
  digits: string;
  confidence: number; // 0-100
};

export type OCRPipelineResult = {
  codes: string[];
  stats: {
    totalLines: number;
    keptLines: number;
    avgConfidence?: number;
    durationMs: number;
    droppedIndices?: number[];
    variantsTriedPerLine?: number;
  };
};

export type OCRProgress = {
  phase: "deskew_crop" | "normalize" | "segment" | "recognize" | "vote" | "done";
  current: number;
  total: number;
  detail?: string;
};

type DetectOptions = {
  onProgress?: (p: OCRProgress) => void;
  batchSize?: number; // số dòng xử lý song song
  turbo?: boolean; // true: ít biến thể hơn để nhanh hơn
  maxLines?: number; // giới hạn số dòng tối đa
};

// Helpers
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

async function loadImageFrom(input: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = typeof input === "string" ? input : URL.createObjectURL(input);
  });
}

function drawImageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function getImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d")!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function putImageData(canvas: HTMLCanvasElement, imageData: ImageData) {
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
}

function toGrayscale(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    o[i] = o[i + 1] = o[i + 2] = y;
    o[i + 3] = 255;
  }
  return out;
}

function applyGamma(imageData: ImageData, gamma: number): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;
  const invGamma = 1 / Math.max(0.01, gamma);
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i];
    const v = Math.pow(y / 255, invGamma) * 255;
    const vv = clamp(v | 0, 0, 255);
    o[i] = o[i + 1] = o[i + 2] = vv;
    o[i + 3] = 255;
  }
  return out;
}

function histogram(imageData: ImageData): number[] {
  const hist = new Array(256).fill(0);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  return hist;
}

// Tăng tương phản theo percentile để làm rõ chữ số trước khi threshold
function enhanceContrast(imageData: ImageData, lowerPct: number = 0.05, upperPct: number = 0.95): ImageData {
  const { width, height, data } = imageData;
  const total = width * height;
  const hist = histogram(imageData);

  const lowThr = Math.max(0, Math.min(total - 1, Math.floor(total * lowerPct)));
  const highThr = Math.max(0, Math.min(total - 1, Math.floor(total * upperPct)));

  let cum = 0;
  let lowVal = 0;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= lowThr) { lowVal = i; break; }
  }
  cum = 0;
  let highVal = 255;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= highThr) { highVal = i; break; }
  }

  if (highVal <= lowVal) return imageData;

  const out = new ImageData(width, height);
  const o = out.data;
  const scale = 255 / Math.max(1, highVal - lowVal);

  for (let i = 0; i < data.length; i += 4) {
    const y = data[i];
    const v = clamp(Math.round((y - lowVal) * scale), 0, 255);
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }
  return out;
}

function otsuThreshold(imageData: ImageData): number {
  const hist = histogram(imageData);
  const total = imageData.width * imageData.height;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let mB = 0;
  let mF = 0;
  let maxVar = -1;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    mB = sumB / wB;
    mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

function threshold(imageData: ImageData, t: number): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i];
    const bin = y >= t ? 255 : 0;
    o[i] = o[i + 1] = o[i + 2] = bin;
    o[i + 3] = 255;
  }
  return out;
}

// Thao tác hình thái: dilation (nở) cho vùng mực đen (0), erosion (co) và closing (dilation rồi erosion)
function dilate(binary: ImageData): ImageData {
  const { width, height, data } = binary;
  const out = new ImageData(width, height);
  const o = out.data;
  const idx = (x: number, y: number) => (y * width + x) * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let setBlack = false;
      for (let ky = -1; ky <= 1 && !setBlack; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const xx = clamp(x + kx, 0, width - 1);
          const yy = clamp(y + ky, 0, height - 1);
          const i = idx(xx, yy);
          if (data[i] < 128) { // pixel đen (mực)
            setBlack = true;
            break;
          }
        }
      }
      const ii = idx(x, y);
      const v = setBlack ? 0 : 255;
      o[ii] = o[ii + 1] = o[ii + 2] = v;
      o[ii + 3] = 255;
    }
  }
  return out;
}

function erode(binary: ImageData): ImageData {
  const { width, height, data } = binary;
  const out = new ImageData(width, height);
  const o = out.data;
  const idx = (x: number, y: number) => (y * width + x) * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allBlack = true;
      for (let ky = -1; ky <= 1 && allBlack; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const xx = clamp(x + kx, 0, width - 1);
          const yy = clamp(y + ky, 0, height - 1);
          const i = idx(xx, yy);
          if (data[i] >= 128) { // gặp trắng -> không đủ đen
            allBlack = false;
            break;
          }
        }
      }
      const ii = idx(x, y);
      const v = allBlack ? 0 : 255;
      o[ii] = o[ii + 1] = o[ii + 2] = v;
      o[ii + 3] = 255;
    }
  }
  return out;
}

function closing(binary: ImageData): ImageData {
  return erode(dilate(binary));
}

function boxBlur(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;
  const idx = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const xx = clamp(x + kx, 0, width - 1);
          const yy = clamp(y + ky, 0, height - 1);
          sum += data[idx(xx, yy)];
          count++;
        }
      }
      const v = (sum / count) | 0;
      const i = idx(x, y);
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
  }
  return out;
}

function scaleCanvas(src: HTMLCanvasElement, targetHeight: number): HTMLCanvasElement {
  const ratio = targetHeight / src.height;
  const targetWidth = Math.max(1, Math.floor(src.width * ratio));
  const out = createCanvas(targetWidth, targetHeight);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, targetWidth, targetHeight);
  return out;
}

function rotateCanvas(src: HTMLCanvasElement, angleDeg: number): HTMLCanvasElement {
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = src.width;
  const h = src.height;
  const newW = Math.ceil(w * cos + h * sin);
  const newH = Math.ceil(h * cos + w * sin);
  const out = createCanvas(newW, newH);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, newW, newH);
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -w / 2, -h / 2);
  return out;
}

function horizontalProjection(binary: ImageData): number[] {
  const { data, width, height } = binary;
  const proj = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isInk = data[i] < 128 ? 1 : 0;
      rowSum += isInk;
    }
    proj[y] = rowSum;
  }
  return proj;
}

function verticalProjection(binary: ImageData): number[] {
  const { data, width, height } = binary;
  const proj = new Array<number>(width).fill(0);
  for (let x = 0; x < width; x++) {
    let colSum = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const isInk = data[i] < 128 ? 1 : 0;
      colSum += isInk;
    }
    proj[x] = colSum;
  }
  return proj;
}

type LineBox = { x: number; y: number; w: number; h: number };

function segmentLines(binary: ImageData, minGap: number = 1): LineBox[] {
  const { width, height } = binary;
  const proj = horizontalProjection(binary);
  // Ink threshold as a ratio of width to be robust
  const inkThreshold = Math.max(1, Math.floor(width * 0.008));
  const rawBands: LineBox[] = [];
  let inBand = false;
  let startY = 0;

  for (let y = 0; y < height; y++) {
    const hasInk = proj[y] > inkThreshold;
    if (hasInk && !inBand) {
      inBand = true;
      startY = y;
    } else if (!hasInk && inBand) {
      const endY = y - 1;
      if (endY - startY + 1 >= 6) {
        rawBands.push({ x: 0, y: startY, w: width, h: endY - startY + 1 });
      }
      inBand = false;
    }
  }
  if (inBand) {
    const endY = height - 1;
    if (endY - startY + 1 >= 6) {
      rawBands.push({ x: 0, y: startY, w: width, h: endY - startY + 1 });
    }
  }

  // Split tall bands by inner whitespace with lower threshold
  const lowInkThreshold = Math.max(1, Math.floor(width * 0.004));
  const refined: LineBox[] = [];
  for (const band of rawBands) {
    if (band.h <= 18) {
      refined.push({ x: 0, y: Math.max(0, band.y - 2), w: width, h: Math.min(height - band.y + 2, band.h + 4) });
      continue;
    }
    const bandProj = proj.slice(band.y, band.y + band.h);
    let inSeg = false;
    let segStart = 0;
    for (let i = 0; i < bandProj.length; i++) {
      const hasInk = bandProj[i] > lowInkThreshold;
      if (hasInk && !inSeg) {
        inSeg = true;
        segStart = i;
      } else if (!hasInk && inSeg) {
        const segEnd = i - 1;
        const segH = segEnd - segStart + 1;
        if (segH >= 6) {
          const y0 = band.y + Math.max(0, segStart - 2);
          const h0 = Math.min(height - y0, segH + 4);
          refined.push({ x: 0, y: y0, w: width, h: h0 });
        }
        inSeg = false;
      }
    }
    if (inSeg) {
      const segEnd = bandProj.length - 1;
      const segH = segEnd - segStart + 1;
      if (segH >= 6) {
        const y0 = band.y + Math.max(0, segStart - 2);
        const h0 = Math.min(height - y0, segH + 4);
        refined.push({ x: 0, y: y0, w: width, h: h0 });
      }
    }
  }

  // Merge very close segments to avoid over-splitting
  const merged: LineBox[] = [];
  for (const lb of refined) {
    const prev = merged[merged.length - 1];
    if (prev && lb.y - (prev.y + prev.h) <= minGap) {
      const top = Math.min(prev.y, lb.y);
      const bottom = Math.max(prev.y + prev.h, lb.y + lb.h);
      prev.y = top;
      prev.h = bottom - top;
    } else {
      merged.push({ ...lb });
    }
  }
  return merged.filter((l) => l.h >= 6);
}

// Chọn nhiều cột có mật độ số cao để tránh bỏ sót dòng nằm lệch cột
function cropTopColumns(binary: ImageData, srcCanvas: HTMLCanvasElement, k: number = 3): HTMLCanvasElement[] {
  const width = binary.width;
  const proj = verticalProjection(binary);
  const peaks = Array.from({ length: width }, (_, x) => ({ x, val: proj[x] }));
  peaks.sort((a, b) => b.val - a.val);

  const roiW = Math.max(48, Math.floor(width * 0.55));
  const minSeparation = Math.floor(roiW * 0.6);
  const chosen: number[] = [];
  const outs: HTMLCanvasElement[] = [];

  for (const p of peaks) {
    if (chosen.some((cx) => Math.abs(cx - p.x) < minSeparation)) continue;
    const startX = clamp(Math.floor(p.x - roiW / 2), 0, width - roiW);
    outs.push(cropToCanvas(srcCanvas, { x: startX, y: 0, w: roiW, h: binary.height }));
    chosen.push(p.x);
    if (outs.length >= k) break;
  }

  // Luôn thêm bản quét toàn khung để tránh bỏ sót
  outs.push(srcCanvas);

  return outs.length ? outs : [srcCanvas];
}

function cropToCanvas(src: HTMLCanvasElement, box: LineBox): HTMLCanvasElement {
  const out = createCanvas(box.w, box.h);
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return out;
}

function trimLineCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  // Build binary image for vertical projection
  const gray = toGrayscale(getImageData(src));
  const blurred = boxBlur(gray);
  const t = otsuThreshold(blurred);
  const binary = threshold(blurred, t);
  const proj = verticalProjection(binary);
  // Determine significant ink threshold relative to line height
  const inkThresh = Math.max(1, Math.floor(binary.height * 0.01));
  let left = 0;
  let right = proj.length - 1;
  // Trim empty columns from the left
  while (left < proj.length && proj[left] <= inkThresh) left++;
  // Trim empty columns from the right
  while (right >= 0 && proj[right] <= inkThresh) right--;
  // If nothing detected, keep original
  if (right <= left) return src;
  // Add a safer padding (10-15%) to avoid cutting off digits
  const pad = Math.floor((right - left + 1) * 0.12);
  const x = clamp(left - pad, 0, src.width - 1);
  const w = clamp(right - left + 1 + 2 * pad, 1, src.width - x);
  const box: LineBox = { x, y: 0, w, h: src.height };
  return cropToCanvas(src, box);
}

function normalizeDigits(text: string): string {
  return (text || "").replace(/[^0-9]/g, "");
}

function extractPrefixedSequence(digits: string): string | null {
  // accept any sequence starting with 042 followed by 9-14 digits
  const matches: string[] = digits.match(/042\d{9,14}/g) ?? [];
  if (matches.length === 0) return null;
  let best = matches[0]!;
  for (const m of matches) {
    if (m.length > best.length) best = m;
  }
  return best;
}

// Thẩm định nhanh tính hợp lệ theo quy tắc map sang code.year (năm 20-99, mã cuối 4 số)
function seqLooksValid(seq: string): boolean {
  if (!seq || seq.length < 13) return false;
  const year = parseInt(seq.slice(-10, -8), 10);
  const code = parseInt(seq.slice(-4), 10);
  return !Number.isNaN(year) && !Number.isNaN(code) && year >= 20 && year <= 99;
}

function votePerChar(strings: string[]): string | null {
  if (strings.length === 0) return null;
  const lengths = new Map<number, number>();
  for (const s of strings) lengths.set(s.length, (lengths.get(s.length) || 0) + 1);
  let targetLen = strings[0].length;
  let bestCount = -1;
  for (const [len, cnt] of lengths.entries()) {
    if (cnt > bestCount) {
      bestCount = cnt;
      targetLen = len;
    }
  }
  const filtered = strings.filter((s) => s.length === targetLen);
  if (filtered.length === 0) return null;
  const outChars: string[] = [];
  for (let i = 0; i < targetLen; i++) {
    const freq = new Map<string, number>();
    for (const s of filtered) {
      const ch = s[i]!;
      freq.set(ch, (freq.get(ch) || 0) + 1);
    }
    let bestCh = "0";
    let best = -1;
    for (const [ch, cnt] of freq.entries()) {
      if (cnt > best) {
        best = cnt;
        bestCh = ch;
      }
    }
    outChars.push(bestCh);
  }
  return outChars.join("");
}

// Weighted per-char voting theo confidence
function votePerCharWeighted(strings: string[], weights: number[]): string | null {
  if (strings.length === 0 || strings.length !== weights.length) return null;
  const lengths = new Map<number, number>();
  for (const s of strings) lengths.set(s.length, (lengths.get(s.length) || 0) + 1);
  let targetLen = strings[0].length;
  let bestCount = -1;
  for (const [len, cnt] of lengths.entries()) {
    if (cnt > bestCount) {
      bestCount = cnt;
      targetLen = len;
    }
  }
  // Lọc theo độ dài đồng thuận
  const filtered: { s: string; w: number }[] = [];
  for (let i = 0; i < strings.length; i++) {
    if (strings[i].length === targetLen) filtered.push({ s: strings[i], w: weights[i] ?? 0 });
  }
  if (filtered.length === 0) return null;
  const outChars: string[] = [];
  for (let i = 0; i < targetLen; i++) {
    const bucket = new Map<string, number>();
    for (const { s, w } of filtered) {
      const ch = s[i]!;
      bucket.set(ch, (bucket.get(ch) || 0) + w);
    }
    let bestCh = "0";
    let bestWeight = -1;
    for (const [ch, wt] of bucket.entries()) {
      if (wt > bestWeight) {
        bestWeight = wt;
        bestCh = ch;
      }
    }
    outChars.push(bestCh);
  }
  return outChars.join("");
}

function buildIntegral(gray: ImageData): { ii: Float64Array; width: number; height: number } {
  const { width, height, data } = gray;
  const ii = new Float64Array(width * height);
  const idx = (x: number, y: number) => y * width + x;
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const iData = (y * width + x) * 4;
      const val = data[iData]; // grayscale in R
      rowSum += val;
      ii[idx(x, y)] = rowSum + (y > 0 ? ii[idx(x, y - 1)] : 0);
    }
  }
  return { ii, width, height };
}

function sumRect(ii: Float64Array, width: number, x0: number, y0: number, x1: number, y1: number): number {
  const idx = (x: number, y: number) => y * width + x;
  const A = x0 > 0 && y0 > 0 ? ii[idx(x0 - 1, y0 - 1)] : 0;
  const B = y0 > 0 ? ii[idx(x1, y0 - 1)] : 0;
  const C = x0 > 0 ? ii[idx(x0 - 1, y1)] : 0;
  const D = ii[idx(x1, y1)];
  return D - B - C + A;
}

function adaptiveThreshold(gray: ImageData, win: number, C: number): ImageData {
  const { width, height } = gray;
  const out = new ImageData(width, height);
  const o = out.data;
  const { ii } = buildIntegral(gray);
  const half = Math.max(1, Math.floor(win / 2));
  for (let y = 0; y < height; y++) {
    const y0 = clamp(y - half, 0, height - 1);
    const y1 = clamp(y + half, 0, height - 1);
    for (let x = 0; x < width; x++) {
      const x0 = clamp(x - half, 0, width - 1);
      const x1 = clamp(x + half, 0, width - 1);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = sumRect(ii, width, x0, y0, x1, y1);
      const mean = sum / area;
      const iData = (y * width + x) * 4;
      const val = gray.data[iData];
      const bin = val > mean - C ? 255 : 0;
      o[iData] = o[iData + 1] = o[iData + 2] = bin;
      o[iData + 3] = 255;
    }
  }
  return out;
}

async function ocrOne(canvas: HTMLCanvasElement, psm: number): Promise<OCRCandidate> {
  const { data } = await Tesseract.recognize(canvas, "eng", {
    tessedit_char_whitelist: "0123456789",
    tessedit_char_blacklist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    user_defined_dpi: "300",
    preserve_interword_spaces: "0",
    tessedit_pageseg_mode: String(psm),
    psm: String(psm),
    oem: "1", // LSTM-only for better digit accuracy
    classify_bln_numeric_mode: "1",
    load_system_dawg: "F",
    load_freq_dawg: "F",
    language_model_penalty_non_dict_word: "1",
  } as any);
  const raw = (data?.text || "").toString();
  const conf = typeof data?.confidence === "number" ? data.confidence : 0;
  return { raw, digits: normalizeDigits(raw), confidence: conf };
}

/**
 * Warm up Tesseract engine to reduce first-call latency.
 */
export async function warmUpOcr(): Promise<void> {
  try {
    const c = createCanvas(32, 16);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    await Tesseract.recognize(c, "eng", {
      tessedit_char_whitelist: "0123456789",
      psm: "7",
      user_defined_dpi: "150",
    } as any);
  } catch {
    // ignore
  }
}

function scoreProjectionSharpness(binary: ImageData): number {
  const proj = horizontalProjection(binary);
  let score = 0;
  for (let i = 1; i < proj.length; i++) {
    const d = proj[i] - proj[i - 1];
    score += d * d;
  }
  return score;
}

function deskewBySearch(baseCanvas: HTMLCanvasElement): HTMLCanvasElement {
  // Coarse-to-fine deskew:
  // 1) Coarse on downscaled canvas
  const coarseTargetH = 800;
  const scaledCoarse = baseCanvas.height > coarseTargetH ? scaleCanvas(baseCanvas, coarseTargetH) : baseCanvas;
  const coarseAngles: number[] = [];
  for (let a = -20; a <= 20; a += 2) coarseAngles.push(a);
  let bestCoarse = 0;
  let bestScore = -1;
  for (const ang of coarseAngles) {
    const rotated = rotateCanvas(scaledCoarse, ang);
    const rd = toGrayscale(getImageData(rotated));
    const rb = boxBlur(rd);
    const t = otsuThreshold(rb);
    const bin = threshold(rb, t);
    const s = scoreProjectionSharpness(bin);
    if (s > bestScore) {
      bestScore = s;
      bestCoarse = ang;
    }
  }
  // 2) Fine around best on target size
  const fineBaseH = 1000;
  const scaledFine = baseCanvas.height < fineBaseH ? scaleCanvas(baseCanvas, fineBaseH) : baseCanvas;
  let bestFine = bestCoarse;
  bestScore = -1;
  for (let ang = bestCoarse - 5; ang <= bestCoarse + 5; ang += 0.5) {
    const rotated = rotateCanvas(scaledFine, ang);
    const rd = toGrayscale(getImageData(rotated));
    const rb = boxBlur(rd);
    const t = otsuThreshold(rb);
    const bin = threshold(rb, t);
    const s = scoreProjectionSharpness(bin);
    if (s > bestScore) {
      bestScore = s;
      bestFine = ang;
    }
  }
  return rotateCanvas(baseCanvas, bestFine);
}

function cropColumn(binary: ImageData, srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const width = binary.width;
  const proj = verticalProjection(binary);
  let maxX = 0;
  let maxVal = -1;
  for (let x = 0; x < width; x++) {
    if (proj[x] > maxVal) {
      maxVal = proj[x];
      maxX = x;
    }
  }
  const roiW = Math.max(32, Math.floor(width * 0.5));
  const startX = clamp(Math.floor(maxX - roiW / 2), 0, width - roiW);
  const box: LineBox = { x: startX, y: 0, w: roiW, h: binary.height };
  return cropToCanvas(srcCanvas, box);
}

function segmentDigitBoxes(binary: ImageData): { x: number; w: number }[] {
  // Tách các "cột" chứa mực số dựa vào chiếu dọc
  const width = binary.width;
  const proj = verticalProjection(binary);
  const inkThresh = Math.max(1, Math.floor(binary.height * 0.01));
  const boxes: { x: number; w: number }[] = [];
  let inBand = false;
  let startX = 0;

  for (let x = 0; x < width; x++) {
    const hasInk = proj[x] > inkThresh;
    if (hasInk && !inBand) {
      inBand = true;
      startX = x;
    } else if (!hasInk && inBand) {
      const endX = x - 1;
      const w = endX - startX + 1;
      if (w >= 6) { // độ rộng tối thiểu cho 1 ký tự
        boxes.push({ x: startX, w });
      }
      inBand = false;
    }
  }
  if (inBand) {
    const endX = width - 1;
    const w = endX - startX + 1;
    if (w >= 6) boxes.push({ x: startX, w });
  }

  // Hợp lý hóa: loại các "cột" quá rộng (khả năng là khoảng trắng nhiễu)
  const maxW = Math.max(10, Math.floor(width * 0.08));
  return boxes.filter((b) => b.w <= maxW);
}

function cropDigitCanvases(srcCanvas: HTMLCanvasElement, digitBoxes: { x: number; w: number }[]): HTMLCanvasElement[] {
  const outs: HTMLCanvasElement[] = [];
  for (const b of digitBoxes) {
    const box = { x: b.x, y: 0, w: b.w, h: srcCanvas.height };
    outs.push(cropToCanvas(srcCanvas, box));
  }
  return outs;
}

async function ocrDigitBest(c: HTMLCanvasElement, turbo: boolean): Promise<{ ch: string | null; conf: number; tried: number }> {
  const jobs: Promise<OCRCandidate>[] = [];
  const gray = toGrayscale(getImageData(c));
  const grayEnhanced = enhanceContrast(gray, 0.03, 0.97);
  const tOtsu = otsuThreshold(grayEnhanced);
  const binOtsu = threshold(grayEnhanced, tOtsu);
  const binClosed = closing(binOtsu);
  const binAdaptive = adaptiveThreshold(grayEnhanced, Math.max(11, Math.floor(c.height * 0.05)), 10);
  const binAdaptiveClosed = closing(binAdaptive);

  const cv1 = createCanvas(c.width, c.height); putImageData(cv1, grayEnhanced);
  const cv2 = createCanvas(c.width, c.height); putImageData(cv2, binClosed);
  const cv3 = createCanvas(c.width, c.height); putImageData(cv3, binAdaptiveClosed);

  const PSM10 = 10;
  const variants = turbo ? [cv2, cv3] : [cv1, cv2, cv3];
  for (const v of variants) {
    jobs.push(ocrOne(v, PSM10));
  }
  const res = await Promise.all(jobs);
  let bestCh: string | null = null;
  let bestConf = -1;
  for (const r of res) {
    const d = normalizeDigits(r.raw);
    const ch = d.length ? d[0]! : null;
    if (ch && r.confidence > bestConf) {
      bestConf = r.confidence;
      bestCh = ch;
    }
  }
  return { ch: bestCh, conf: Math.max(0, bestConf), tried: res.length };
}

// New: Heuristic for mobile detection
function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
}

// New: Mask non-green pixels to white using adaptive percentile threshold
function maskNonGreenToWhite(srcCanvas: HTMLCanvasElement, percentile: number = 0.88): HTMLCanvasElement {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Compute "green score" per pixel: G - (R+B)/2 normalized by brightness
  const scores = new Float32Array(w * h);
  let idxPix = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    const bright = Math.max(1, r + g + b);
    const rel = g - (r + b) * 0.5;
    const norm = rel / bright; // -1..1 approx
    scores[idxPix++] = norm;
  }

  // Determine adaptive threshold by percentile
  const sorted = Array.from(scores).sort((a,b)=>a-b);
  const nth = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * percentile)));
  let thr = sorted[nth];

  // Count green-ish pixels
  let greenCount = 0;
  for (let k = 0; k < scores.length; k++) {
    if (scores[k] > thr) greenCount++;
  }
  // Fallback if too few greens
  const minArea = Math.max(500, Math.floor(0.0005 * w * h));
  if (greenCount < minArea) {
    // fallback: require G significantly larger than R/B and above minimal absolute
    thr = -1; // use ratio fallback
  }

  idxPix = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    let keep = false;
    if (thr > -0.9) {
      keep = scores[idxPix] > thr;
    } else {
      keep = g > r * 1.12 && g > b * 1.12 && g > 80;
    }
    if (!keep) {
      d[i] = d[i+1] = d[i+2] = 255; // white-out non-green
    }
    idxPix++;
  }
  const out = createCanvas(w, h);
  out.getContext('2d')!.putImageData(img, 0, 0);
  return out;
}

// New: Horizontal morphological operations (1x3 kernel) to reduce underlines
function horizontalErode(binary: ImageData): ImageData {
  const { width, height, data } = binary;
  const out = new ImageData(width, height);
  const o = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Erode black if all neighbors horizontally are black (0)
      const i = (y * width + x) * 4;
      const left = ((y * width + Math.max(0, x - 1)) * 4);
      const right = ((y * width + Math.min(width - 1, x + 1)) * 4);
      const allBlack = (data[left] < 128) && (data[i] < 128) && (data[right] < 128);
      const v = allBlack ? 0 : 255;
      o[i] = o[i+1] = o[i+2] = v;
      o[i+3] = 255;
    }
  }
  return out;
}
function horizontalDilate(binary: ImageData): ImageData {
  const { width, height, data } = binary;
  const out = new ImageData(width, height);
  const o = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const left = ((y * width + Math.max(0, x - 1)) * 4);
      const right = ((y * width + Math.min(width - 1, x + 1)) * 4);
      const anyBlack = (data[left] < 128) || (data[i] < 128) || (data[right] < 128);
      const v = anyBlack ? 0 : 255;
      o[i] = o[i+1] = o[i+2] = v;
      o[i+3] = 255;
    }
  }
  return out;
}
function openingHorizontal(binary: ImageData): ImageData {
  return horizontalDilate(horizontalErode(binary));
}

/**
 * Main entry: Detect asset codes from a single image (Blob or URL).
 * Steps:
 * - Deskew (search), crop to most-dense numeric column
 * - Grayscale + binary for segmentation
 * - Segment lines
 * - For each line: build multi variants (gamma, thresholds incl. Otsu), run OCR with PSM 7 & 11 in parallel, per-char voting
 * - Filter 0423/0424, dedupe, detect room by prefix
 */
export async function detectCodesFromImage(
  input: Blob | string,
  options?: DetectOptions
): Promise<OCRPipelineResult> {
  const onProgress = options?.onProgress;
  const defaultBatch = isMobileUA() ? 4 : 6;
  const batchSize = Math.max(1, options?.batchSize ?? defaultBatch);
  const turbo = options?.turbo ?? false;
  const maxLinesAutoScale = (h: number) => {
    if (h < 900) return turbo ? 14 : 22;
    if (h < 1400) return turbo ? 18 : 30;
    return turbo ? 28 : 45;
  };

  const t0 = performance.now();
  const img = await loadImageFrom(input);
  let baseCanvas = drawImageToCanvas(img);

  // Ensure minimum scale for full pipeline
  const minHeight = 1000;
  if (baseCanvas.height < minHeight) {
    baseCanvas = scaleCanvas(baseCanvas, minHeight);
  }

  // 1) Quick whole-image scan first
  onProgress?.({ phase: "recognize", current: 0, total: 1, detail: "quick_scan • bắt đầu" });
  const quick = await quickWholeImageScan(baseCanvas, onProgress, { turbo, maxExpect: 10 });
  const quickConfByCode = quick.confByCode;
  if (quick.codes.length > 0) {
    // Early return if quick scan succeeded
    onProgress?.({ phase: "done", current: 1, total: 1, detail: `early_exit_reason: quick_scan_hit` });
    const t1 = performance.now();
    return {
      codes: quick.codes,
      stats: {
        totalLines: 0,
        keptLines: quick.codes.length,
        avgConfidence: undefined,
        durationMs: Math.round(t1 - t0),
        droppedIndices: [],
        variantsTriedPerLine: undefined,
      },
    };
  }

  // 2) Deskew coarse-to-fine
  const deskewed = deskewBySearch(baseCanvas);
  onProgress?.({ phase: "deskew_crop", current: 1, total: 1, detail: "deskew • coarse-to-fine xong" });

  // 3) Build masked + binary for segmentation (reduce moiré/underline)
  const masked = maskNonGreenToWhite(deskewed, 0.88);
  const grayData0 = toGrayscale(getImageData(masked));
  const blurred0 = boxBlur(grayData0);
  const win0 = Math.max(15, Math.floor(masked.height * 0.05));
  const binForProj0 = adaptiveThreshold(blurred0, win0, 10);
  const binForProj = openingHorizontal(binForProj0); // soften underlines
  onProgress?.({ phase: "normalize", current: 1, total: 1, detail: "normalize • mask xanh + adaptive threshold" });

  // 4) Segment lines
  const lines = segmentLines(binForProj, 1);
  const rois0 = lines.map((box) => cropToCanvas(deskewed, box)).map((c) => trimLineCanvas(c));

  // Limit lines dynamically when Auto
  const maxLines =
    typeof options?.maxLines === "number" && options.maxLines > 0
      ? options.maxLines
      : maxLinesAutoScale(baseCanvas.height);
  const lineRois = rois0.slice(0, Math.max(1, maxLines));

  onProgress?.({ phase: "segment", current: lineRois.length, total: lineRois.length, detail: `segmentation • totalLines=${lines.length}, using=${lineRois.length}` });

  const results: string[] = [];
  const confidences: number[] = [];
  const droppedIndices: number[] = [];
  let totalVariantsTried = 0;

  // Consensus tracking across ROIs
  const codeOccurrence = new Map<string, number>();
  const minConfBase = turbo ? 55 : 65;
  const passesDynamicThreshold = (code: string, conf: number): boolean => {
    const repeatReduce = (codeOccurrence.get(code) || 0) >= 1 ? 10 : 0;
    const quickReduce = quickConfByCode && quickConfByCode[code] ? 5 : 0;
    const need = Math.max(0, minConfBase - repeatReduce - quickReduce);
    return (conf || 0) >= need;
  };

  // Helper: process one ROI with micro-rotation gating
  const processOne = async (roi: HTMLCanvasElement): Promise<{ chosenStr: string | null; chosenConf: number; variantsTried: number }> => {
    let variantsTried = 0;
    const targetH = 128;
    const roiScaled = scaleCanvas(roi, targetH);

    const roiGray = toGrayscale(getImageData(roiScaled));
    const roiGrayEnhanced = enhanceContrast(roiGray, 0.03, 0.97);

    const tOtsuRoiE = otsuThreshold(roiGrayEnhanced);
    const roiBinOtsu = threshold(roiGrayEnhanced, tOtsuRoiE);
    const roiBinClosed = closing(roiBinOtsu);

    // Adaptive threshold (local)
    const win = Math.max(15, Math.floor(roiScaled.height * 0.04));
    const roiBinAdaptive = adaptiveThreshold(roiGrayEnhanced, win, 10);
    const roiBinAdaptiveClosed = closing(roiBinAdaptive);

    // 1) Quick probe (PSM 13) to check for '042'
    const quickCanvas = createCanvas(roiScaled.width, roiScaled.height);
    putImageData(quickCanvas, roiBinClosed);
    const quickCand = await ocrOne(quickCanvas, 13);
    variantsTried += 1;
    const quickSeq = extractPrefixedSequence(normalizeDigits(quickCand.raw));
    if (!quickSeq) {
      return { chosenStr: null, chosenConf: 0, variantsTried };
    }
    const minAccept = turbo ? 60 : 75;
    if (seqLooksValid(quickSeq) && (quickCand.confidence || 0) >= minAccept) {
      return { chosenStr: quickSeq, chosenConf: quickCand.confidence || minAccept, variantsTried };
    }

    // 2) Detailed line OCR with variants
    const roiGamma08 = applyGamma(roiGrayEnhanced, 0.8);
    const roiGamma12 = applyGamma(roiGrayEnhanced, 1.2);
    const roiBin160 = threshold(roiGrayEnhanced, 160);

    const canvases: HTMLCanvasElement[] = [];
    const pushDataCanvas = (d: ImageData) => {
      const c = createCanvas(roiScaled.width, roiScaled.height);
      putImageData(c, d);
      canvases.push(c);
    };

    if (turbo) {
      pushDataCanvas(roiGrayEnhanced);
      pushDataCanvas(roiBinOtsu);
      pushDataCanvas(roiBinAdaptiveClosed);
    } else {
      pushDataCanvas(roiGrayEnhanced);
      pushDataCanvas(roiGamma08);
      pushDataCanvas(roiGamma12);
      pushDataCanvas(roiBinOtsu);
      pushDataCanvas(roiBinAdaptiveClosed);
      pushDataCanvas(roiBin160);
    }

    const PSM7 = 7;
    const PSM11 = 11;

    const jobs: Promise<OCRCandidate>[] = [];
    for (const c of canvases) {
      jobs.push(ocrOne(c, PSM7));
      jobs.push(ocrOne(c, PSM11));
    }
    const limit = turbo ? 4 : 6;
    const candsRaw: OCRCandidate[] = [];
    for (let i = 0; i < jobs.length; i += limit) {
      const partial = await Promise.all(jobs.slice(i, i + limit));
      candsRaw.push(...partial);
      variantsTried += partial.length;
    }

    // Collect candidates
    const candStrings: string[] = [];
    const candWeights: number[] = [];
    for (const c of candsRaw) {
      const s = extractPrefixedSequence(normalizeDigits(c.raw));
      if (s && s.length >= 13 && s.startsWith("042")) {
        candStrings.push(s);
        candWeights.push(c.confidence || 0);
      }
    }

    let chosenStr: string | null = null;
    let chosenConf = 0;
    if (candStrings.length > 0) {
      const votedW = votePerCharWeighted(candStrings, candWeights);
      chosenStr = votedW || votePerChar(candStrings);
      const matches = candsRaw.filter((c) => {
        const s = extractPrefixedSequence(normalizeDigits(c.raw));
        return s && s === chosenStr;
      });
      chosenConf = matches.length ? matches.reduce((a, b) => a + (b.confidence || 0), 0) / matches.length : 0;
    }

    // 3) Per-digit fallback if low confidence
    if (!chosenStr || chosenConf < (turbo ? 65 : 75)) {
      const boxesOtsu = segmentDigitBoxes(roiBinClosed);
      const boxesAdp = segmentDigitBoxes(roiBinAdaptiveClosed);
      let digitBoxes = boxesOtsu;
      if ((boxesAdp.length >= 12 && boxesAdp.length <= 20) || boxesAdp.length > boxesOtsu.length) {
        digitBoxes = boxesAdp;
      }
      if (digitBoxes.length >= 12 && digitBoxes.length <= 20) {
        const digitCanvases = cropDigitCanvases(roiScaled, digitBoxes);
        const digits: string[] = [];
        let sumConf = 0;
        for (const dc of digitCanvases) {
          const { ch, conf, tried } = await ocrDigitBest(dc, !!turbo);
          variantsTried += tried;
          digits.push(ch ?? "");
          sumConf += conf || 0;
        }
        const joined = digits.join("");
        const improvedSeq = extractPrefixedSequence(normalizeDigits(joined));
        if (improvedSeq && seqLooksValid(improvedSeq)) {
          chosenStr = improvedSeq;
          chosenConf = Math.round(sumConf / Math.max(1, digitCanvases.length));
        }
      }
    }

    // 4) Micro-rotation gating if still not good enough
    const needMicro = !chosenStr || chosenConf < 75 || (chosenStr.length < 13);
    if (needMicro) {
      const microAngles = [-7, -5, -3, -1.5, 0, 1.5, 3, 5, 7];
      const stable = new Map<string, number>();
      for (const ang of microAngles) {
        const rotated = ang === 0 ? roiScaled : rotateCanvas(roiScaled, ang);
        const rg = toGrayscale(getImageData(rotated));
        const rge = enhanceContrast(rg, 0.03, 0.97);
        const tO = otsuThreshold(rge);
        const rbin = closing(threshold(rge, tO));
        const c = createCanvas(rotated.width, rotated.height);
        putImageData(c, rbin);
        const psm7 = await ocrOne(c, 7);
        const psm11 = await ocrOne(c, 11);
        variantsTried += 2;

        const candidates = [psm7, psm11];
        for (const cand of candidates) {
          const s = extractPrefixedSequence(normalizeDigits(cand.raw));
          if (s && seqLooksValid(s)) {
            stable.set(s, (stable.get(s) || 0) + 1);
            if (cand.confidence > chosenConf) {
              chosenStr = s;
              chosenConf = cand.confidence || chosenConf;
            }
          }
        }
        // Early stop if a string repeats twice with sufficient confidence
        for (const [s, cnt] of stable.entries()) {
          if (cnt >= 2 && chosenConf >= 75) {
            break;
          }
        }
      }
    }

    // 5) Final fallback slight blur + threshold
    if (!chosenStr || chosenConf < 60) {
      const roiBlurred = boxBlur(roiGrayEnhanced);
      const altBinOtsu = closing(threshold(roiBlurred, Math.max(100, tOtsuRoiE - 10)));
      const altCanvas = createCanvas(roiScaled.width, roiScaled.height);
      putImageData(altCanvas, altBinOtsu);
      const altCands = await Promise.all([ocrOne(altCanvas, 7), ocrOne(altCanvas, 11)]);
      variantsTried += altCands.length;
      const altStrings = altCands
        .map((c) => extractPrefixedSequence(normalizeDigits(c.raw)))
        .filter((s): s is string => !!s && s.length >= 13 && s.startsWith("042"));
      const altVoted = votePerCharWeighted(altStrings, altCands.map((c) => c.confidence || 0)) || votePerChar(altStrings);
      if (altVoted && seqLooksValid(altVoted)) {
        chosenStr = altVoted;
        chosenConf = Math.max(...altCands.map((c) => c.confidence || 0));
      }
    }

    return { chosenStr, chosenConf, variantsTried };
  };

  onProgress?.({ phase: "recognize", current: 0, total: lineRois.length, detail: `recognition • batchSize=${batchSize}` });

  const uniqueSet = new Set<string>();
  const enoughThreshold = 20; // early-exit when enough unique codes
  const total = lineRois.length;
  let done = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = lineRois.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((roi) => processOne(roi)));
    batchResults.forEach((br, idx) => {
      const lineIndex = i + idx;
      totalVariantsTried += br.variantsTried;
      if (br.chosenStr && passesDynamicThreshold(br.chosenStr, br.chosenConf)) {
        results.push(br.chosenStr);
        confidences.push(br.chosenConf || 0);
        uniqueSet.add(br.chosenStr);
        codeOccurrence.set(br.chosenStr, (codeOccurrence.get(br.chosenStr) || 0) + 1);
      } else {
        droppedIndices.push(lineIndex);
      }
      done += 1;
      onProgress?.({ phase: "recognize", current: done, total, detail: `recognition • ${done}/${total}` });
    });

    // Early exit if enough unique codes detected
    if (uniqueSet.size >= enoughThreshold) {
      onProgress?.({ phase: "done", current: done, total, detail: "early_exit_reason: enough_unique_codes" });
      break;
    }
  }

  // 5) Fallback multi-angle if still empty
  if (uniqueSet.size === 0) {
    onProgress?.({ phase: "recognize", current: 0, total: 1, detail: "fallback_multi_angle • start" });
    const { codes: fbCodes, reason } = await fallbackMultiAngle(baseCanvas, async (roi) => processOne(roi), onProgress, { turbo, maxLines, quickConfByCode });
    for (const c of fbCodes) {
      uniqueSet.add(c);
      codeOccurrence.set(c, (codeOccurrence.get(c) || 0) + 1);
      results.push(c);
      confidences.push(minConfBase); // fallback: approximate baseline
    }
    if (uniqueSet.size > 0) {
      onProgress?.({ phase: "done", current: 1, total: 1, detail: `early_exit_reason: ${reason || 'multi_angle_hit'}` });
    }
  }

  // Prepare outputs
  const orderedAll = results.slice();
  onProgress?.({ phase: "vote", current: orderedAll.length, total: total, detail: `vote • codes=${orderedAll.length} • repeats=${Array.from(codeOccurrence.values()).reduce((a,b)=>a+(b>1?1:0),0)}` });

  const t1 = performance.now();
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;
  const avgVariantsPerLine = Math.round(totalVariantsTried / Math.max(1, lineRois.length));

  onProgress?.({ phase: "done", current: orderedAll.length, total: total, detail: `done • avgConf=${avgConfidence ? Math.round(avgConfidence) : '-'} • variants/line=${avgVariantsPerLine || '-'}` });

  return {
    codes: orderedAll,
    stats: {
      totalLines: lineRois.length,
      keptLines: orderedAll.length,
      avgConfidence,
      durationMs: Math.round(t1 - t0),
      droppedIndices,
      variantsTriedPerLine: avgVariantsPerLine,
    },
  };
}

// New: Quick whole-image scan (coarse-to-fast)
async function quickWholeImageScan(
  baseCanvas: HTMLCanvasElement,
  onProgress?: (p: OCRProgress) => void,
  opts?: { turbo?: boolean; maxExpect?: number }
): Promise<{ codes: string[]; unique: string[]; anglesTried: number; earlyExit: string | null; confByCode: Record<string, number> }> {
  const t0 = performance.now();
  const targetH = 760;
  const canvas = baseCanvas.height > targetH ? scaleCanvas(baseCanvas, targetH) : baseCanvas;
  const angles: number[] = [];
  for (let a = -25; a <= 25; a += 3) angles.push(a);
  const seen = new Map<string, number>(); // code -> bestConf
  const angleSeen = new Map<string, number>(); // code -> count of angles
  const maxExpect = Math.max(1, opts?.maxExpect ?? 10);
  const minConfQuick = opts?.turbo ? 60 : 65;
  let earlyExit: string | null = null;

  for (let i = 0; i < angles.length; i++) {
    const ang = angles[i]!;
    onProgress?.({ phase: "recognize", current: i, total: angles.length, detail: `quick_scan • góc ${ang}°` });
    const rotated = rotateCanvas(canvas, ang);
    const masked = maskNonGreenToWhite(rotated, 0.88);
    const gray = toGrayscale(getImageData(masked));
    const blurred = boxBlur(gray);
    const win = Math.max(15, Math.floor(masked.height * 0.05));
    const bin = adaptiveThreshold(blurred, win, 10);
    const binClosed = closing(bin);

    // OCR whole image with PSM 6
    const c = createCanvas(masked.width, masked.height);
    putImageData(c, binClosed);
    const cand = await ocrOne(c, 6);
    const text = cand.raw || "";
    const matches = (text.match(/042\d{9,14}/g) || []) as string[];

    // Accept only if confidence passes dynamic threshold (lower if repeated across angles)
    const accepted: string[] = [];
    for (const m of matches) {
      if (!seqLooksValid(m)) continue;
      const prevCount = angleSeen.get(m) || 0;
      const reduce = prevCount >= 1 ? 8 : 0;
      if ((cand.confidence || 0) >= (minConfQuick - reduce)) {
        accepted.push(m);
        const prevConf = seen.get(m) || 0;
        if ((cand.confidence || 0) > prevConf) seen.set(m, cand.confidence || 0);
        angleSeen.set(m, prevCount + 1);
      }
    }

    const uniqueNow = Array.from(seen.keys());

    // Early exits:
    if (uniqueNow.length >= 2) {
      earlyExit = "quick_scan_hit_multi";
      break;
    }
    for (const code of uniqueNow) {
      if ((angleSeen.get(code) || 0) >= 2) {
        earlyExit = "quick_scan_repeated_code";
        break;
      }
    }
    if (earlyExit) break;
    if (uniqueNow.length >= maxExpect) {
      earlyExit = "quick_scan_enough_expected";
      break;
    }
  }
  const t1 = performance.now();
  onProgress?.({ phase: "done", current: 1, total: 1, detail: `quick_scan • góc thử: ${angles.length}, hit: ${seen.size > 0}, ${Math.round(t1 - t0)}ms` });

  const codes = Array.from(seen.entries()).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
  const confByCode = Object.fromEntries(seen.entries());
  return { codes, unique: codes, anglesTried: angles.length, earlyExit, confByCode };
}

// New: Fallback multi-angle robust scan using segmentation on masked green
async function fallbackMultiAngle(
  baseCanvas: HTMLCanvasElement,
  processFn: (roi: HTMLCanvasElement) => Promise<{ chosenStr: string | null; chosenConf: number; variantsTried: number }>,
  onProgress?: (p: OCRProgress) => void,
  opts?: { turbo?: boolean; maxLines?: number; quickConfByCode?: Record<string, number> }
): Promise<{ codes: string[]; reason: string | null }> {
  const angles = [-28, -22, -16, -10, -6, -3, 0, 3, 6, 10, 16, 22, 28];
  const codes = new Set<string>();
  let reason: string | null = null;
  const minConfBase = opts?.turbo ? 55 : 65;

  for (let i = 0; i < angles.length; i++) {
    const ang = angles[i]!;
    onProgress?.({ phase: "recognize", current: i, total: angles.length, detail: `fallback_multi_angle • góc ${ang}°` });
    const rotated = rotateCanvas(baseCanvas, ang);
    const masked = maskNonGreenToWhite(rotated, 0.86);
    const gray = toGrayscale(getImageData(masked));
    const blurred = boxBlur(gray);
    const win = Math.max(15, Math.floor(masked.height * 0.05));
    const bin = adaptiveThreshold(blurred, win, 10);
    const binOpened = openingHorizontal(bin);
    const lines = segmentLines(binOpened, 1);
    let rois = lines.map((box) => cropToCanvas(rotated, box)).map((c) => trimLineCanvas(c));
    if (typeof opts?.maxLines === "number" && opts.maxLines > 0) {
      rois = rois.slice(0, Math.max(1, opts.maxLines));
    }
    for (const roi of rois) {
      const r = await processFn(roi);
      const reduce = opts?.quickConfByCode && r.chosenStr && opts.quickConfByCode[r.chosenStr] ? 5 : 0;
      const accept = r.chosenStr && (r.chosenConf || 0) >= (minConfBase - reduce) && seqLooksValid(r.chosenStr);
      if (accept) {
        codes.add(r.chosenStr!);
        if (codes.size >= 2) {
          reason = "multi_angle_hit";
          return { codes: Array.from(codes), reason };
        }
      }
    }
  }
  return { codes: Array.from(codes), reason };
}