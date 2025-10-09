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
  const inkThreshold = Math.max(2, Math.floor(width * 0.01));
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
      if (endY - startY + 1 >= 8) {
        rawBands.push({ x: 0, y: startY, w: width, h: endY - startY + 1 });
      }
      inBand = false;
    }
  }
  if (inBand) {
    const endY = height - 1;
    if (endY - startY + 1 >= 8) {
      rawBands.push({ x: 0, y: startY, w: width, h: endY - startY + 1 });
    }
  }

  // Chia band lớn theo khoảng trống nội bộ (giúp tách các dòng dính liền)
  const lowInkThreshold = Math.max(1, Math.floor(width * 0.005));
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
        if (segH >= 8) {
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
      if (segH >= 8) {
        const y0 = band.y + Math.max(0, segStart - 2);
        const h0 = Math.min(height - y0, segH + 4);
        refined.push({ x: 0, y: y0, w: width, h: h0 });
      }
    }
  }

  // Gộp các đoạn quá sát nhau để tránh chia thừa
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
  // Hạ ngưỡng tối thiểu độ cao dòng để bắt được dòng thấp hơn
  return merged.filter((l) => l.h >= 7);
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
  // Determine significant ink threshold based on line height
  const inkThresh = Math.max(1, Math.floor(binary.height * 0.01));
  let left = 0;
  let right = proj.length - 1;
  // Trim empty columns from the left
  while (left < proj.length && proj[left] <= inkThresh) left++;
  // Trim empty columns from the right
  while (right >= 0 && proj[right] <= inkThresh) right--;
  // If nothing detected, keep original
  if (right <= left) return src;
  // Add a small padding to avoid cutting off digits
  const pad = Math.floor((right - left + 1) * 0.05);
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
  const grayData = toGrayscale(getImageData(baseCanvas));
  const blurred = boxBlur(grayData);
  let bestScore = -1;
  let bestCanvas = baseCanvas;
  for (let ang = -6; ang <= 6; ang += 0.5) {
    const rotated = rotateCanvas(baseCanvas, ang);
    const rd = toGrayscale(getImageData(rotated));
    const rb = boxBlur(rd);
    const t = otsuThreshold(rb);
    const bin = threshold(rb, t);
    const s = scoreProjectionSharpness(bin);
    if (s > bestScore) {
      bestScore = s;
      bestCanvas = rotated;
    }
  }
  return bestCanvas;
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

// Group line ROIs by y-position
type LineROI = { canvas: HTMLCanvasElement; y: number; h: number };

function groupLineRois(rois: LineROI[], tolerance: number = 4): LineROI[][] {
  if (rois.length === 0) return [];
  const sorted = [...rois].sort((a, b) => a.y - b.y);
  const groups: LineROI[][] = [];
  let current: LineROI[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    const cur = sorted[i];
    if (Math.abs(cur.y - prev.y) <= tolerance) {
      current.push(cur);
    } else {
      groups.push(current);
      current = [cur];
    }
  }
  groups.push(current);
  return groups;
}

// Add a typed result for per-ROI processing
type ROIProcessResult = { chosenStr: string | null; chosenConf: number; variantsTried: number };

// Lightweight per-ROI OCR that tries grayscale and closed-binary, then votes to pick a valid '042...' sequence
const processOne = async (roi: HTMLCanvasElement): Promise<ROIProcessResult> => {
  let variantsTried = 0;

  const targetH = Math.max(64, Math.min(256, roi.height));
  const roiScaled = scaleCanvas(roi, targetH);

  const gray = toGrayscale(getImageData(roiScaled));
  const tOtsu = otsuThreshold(gray);
  const binOtsu = threshold(gray, tOtsu);
  const binClosed = closing(binOtsu);

  const c1 = createCanvas(roiScaled.width, roiScaled.height); putImageData(c1, gray);
  const c2 = createCanvas(roiScaled.width, roiScaled.height); putImageData(c2, binClosed);

  const jobs: Promise<OCRCandidate>[] = [ocrOne(c1, 7), ocrOne(c1, 11), ocrOne(c2, 7), ocrOne(c2, 11)];
  const results = await Promise.all(jobs);
  variantsTried += results.length;

  const candStrings: string[] = [];
  const candWeights: number[] = [];
  for (const r of results) {
    const seq = extractPrefixedSequence(normalizeDigits(r.raw));
    if (seq) {
      candStrings.push(seq);
      candWeights.push(r.confidence || 0);
    }
  }

  let chosenStr: string | null = null;
  let chosenConf = 0;

  if (candStrings.length) {
    const voted = votePerCharWeighted(candStrings, candWeights) || votePerChar(candStrings);
    if (voted && seqLooksValid(voted)) {
      chosenStr = voted;
      const matches = results.filter((cr) => extractPrefixedSequence(normalizeDigits(cr.raw)) === chosenStr);
      chosenConf = matches.length ? Math.round(matches.reduce((a: number, b: OCRCandidate) => a + (b.confidence || 0), 0) / matches.length) : 0;
    } else {
      const tuples = candStrings.map((s, i) => ({ s, w: candWeights[i] || 0 }));
      tuples.sort((a, b) => (b.w - a.w) || (b.s.length - a.s.length));
      chosenStr = tuples[0]?.s ?? null;
      chosenConf = tuples[0]?.w ?? 0;
    }
  }

  return { chosenStr, chosenConf, variantsTried };
};

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
  const batchSize = Math.max(1, options?.batchSize ?? 4);
  const turbo = options?.turbo ?? false;
  const maxLines = options?.maxLines;

  const t0 = performance.now();
  const img = await loadImageFrom(input);
  let baseCanvas = drawImageToCanvas(img);

  // Ensure minimum scale
  const minHeight = 1000;
  if (baseCanvas.height < minHeight) {
    baseCanvas = scaleCanvas(baseCanvas, minHeight);
  }

  // Deskew
  const deskewed = deskewBySearch(baseCanvas);
  onProgress?.({ phase: "deskew_crop", current: 0, total: 1, detail: "Căn thẳng & cắt cột số" });

  // Base grayscale + binary
  const grayData0 = toGrayscale(getImageData(deskewed));
  const blurred0 = boxBlur(grayData0);
  const tOtsu0 = otsuThreshold(blurred0);
  const binForProj = threshold(blurred0, tOtsu0);
  onProgress?.({ phase: "normalize", current: 1, total: 1, detail: "Chuẩn hóa ảnh cho phân đoạn" });

  // Cắt theo 3 cột có mật độ số cao + toàn khung
  const columnCanvases = cropTopColumns(binForProj, deskewed, 3);

  // Xây dựng binary cho từng cột và tách dòng (giữ y/h để nhóm theo dòng)
  const lineRois: LineROI[] = [];
  for (const columnCanvas of columnCanvases) {
    const grayData = toGrayscale(getImageData(columnCanvas));
    const blurred = boxBlur(grayData);
    const tOtsu = otsuThreshold(blurred);
    const binForSeg = threshold(blurred, tOtsu);
    const lines = segmentLines(binForSeg, 1);
    for (const box of lines) {
      let c = cropToCanvas(columnCanvas, box);
      c = trimLineCanvas(c);
      lineRois.push({ canvas: c, y: box.y, h: box.h });
      if (typeof maxLines === "number" && maxLines > 0 && lineRois.length >= maxLines) break;
    }
    if (typeof maxLines === "number" && maxLines > 0 && lineRois.length >= maxLines) break;
  }

  // Nhóm theo vị trí y gần nhau để đại diện cho các cột của cùng một dòng
  const clusters = groupLineRois(lineRois, 4);
  onProgress?.({ phase: "segment", current: clusters.length, total: clusters.length, detail: `Tách ${clusters.length} dòng` });

  const results: string[] = [];
  const confidences: number[] = [];
  const droppedIndices: number[] = [];
  let totalVariantsTried = 0;

  const total = clusters.length;
  let done = 0;

  onProgress?.({ phase: "recognize", current: 0, total, detail: "Nhận dạng các dòng" });

  // Nhận dạng theo nhóm dòng (mỗi nhóm gồm nhiều ROI từ các cột khác nhau)
  for (let gi = 0; gi < clusters.length; gi += batchSize) {
    const batch = clusters.slice(gi, gi + batchSize);
    // OCR tất cả ROI trong từng nhóm
    const batchGroupResults: ROIProcessResult[][] = await Promise.all(
      batch.map(async (group) => {
        const perRoi = await Promise.all(group.map((roi) => processOne(roi.canvas)));
        return perRoi;
      })
    );

    batchGroupResults.forEach((perGroup: ROIProcessResult[], idx: number) => {
      const groupIndex = gi + idx;

      // Bỏ phiếu chéo theo từng ký tự giữa các ROI của cùng một dòng
      const candStrings = perGroup
        .map((r: ROIProcessResult) => r.chosenStr)
        .filter((s: string | null): s is string => !!s && s.length >= 13 && s.startsWith("042"));
      const candWeights = perGroup
        .map((r: ROIProcessResult) => r.chosenConf || 0);

      const voted = candStrings.length
        ? (votePerCharWeighted(candStrings, candWeights) || votePerChar(candStrings))
        : null;

      const chosen = voted && seqLooksValid(voted) ? voted : (candStrings.find((s: string) => seqLooksValid(s)) ?? null);

      const chosenConf = chosen
        ? Math.round(
            perGroup
              .filter((r: ROIProcessResult) => r.chosenStr === chosen)
              .reduce((a: number, b: ROIProcessResult) => a + (b.chosenConf || 0), 0) /
            Math.max(1, perGroup.filter((r: ROIProcessResult) => r.chosenStr === chosen).length)
          )
        : 0;

      const groupVariants = perGroup.reduce((a: number, b: ROIProcessResult) => a + (b.variantsTried || 0), 0);
      totalVariantsTried += groupVariants;

      if (chosen) {
        results.push(chosen);
        confidences.push(chosenConf);
      } else {
        droppedIndices.push(groupIndex);
      }

      done += 1;
      onProgress?.({ phase: "recognize", current: done, total, detail: `Nhận dạng dòng ${done}/${total}` });
    });
  }

  // Bỏ phiếu tổng thể đã làm theo nhóm, không cần ghép thêm
  onProgress?.({ phase: "vote", current: results.length, total: total, detail: "Ghép kết quả theo từng dòng" });

  const t1 = performance.now();
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;
  const avgVariantsPerLine = Math.round(totalVariantsTried / Math.max(1, clusters.length));

  onProgress?.({ phase: "done", current: results.length, total: total, detail: "Điền mã" });

  return {
    codes: results,
    stats: {
      totalLines: clusters.length,
      keptLines: results.length,
      avgConfidence,
      durationMs: Math.round(t1 - t0),
      droppedIndices,
      variantsTriedPerLine: avgVariantsPerLine,
    },
  };
}