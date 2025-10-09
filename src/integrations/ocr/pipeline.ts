"use client";

import Tesseract from "tesseract.js";

type OCRCandidate = {
  raw: string;
  digits: string;
  confidence: number; // 0-100
};

export type OCRPipelineResult = {
  codes: string[];
  detectedRoom?: string;
  stats: {
    totalLines: number;
    keptLines: number;
    avgConfidence?: number;
    durationMs: number;
  };
};

// Simple helpers
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
    if (typeof input === "string") {
      img.src = input;
    } else {
      img.src = URL.createObjectURL(input);
    }
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
    // Luminosity method
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

// Simple 3x3 box blur for optional smoothing (helps against moire)
function boxBlur(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;

  function idx(x: number, y: number) {
    return (y * width + x) * 4;
  }
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

// Horizontal projection for line segmentation on a binary image
function horizontalProjection(binary: ImageData): number[] {
  const { data, width, height } = binary;
  const proj = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // black = 0, white = 255
      const isInk = data[i] < 128 ? 1 : 0;
      rowSum += isInk;
    }
    proj[y] = rowSum;
  }
  return proj;
}

type LineBox = { x: number; y: number; w: number; h: number };

function segmentLines(binary: ImageData, minGap: number = 2): LineBox[] {
  const { width, height } = binary;
  const proj = horizontalProjection(binary);
  const inkThreshold = Math.max(2, Math.floor(width * 0.02)); // require at least 2% ink per row
  const lines: LineBox[] = [];

  let inBand = false;
  let startY = 0;

  for (let y = 0; y < height; y++) {
    const hasInk = proj[y] > inkThreshold;
    if (hasInk && !inBand) {
      inBand = true;
      startY = y;
    } else if (!hasInk && inBand) {
      // end band
      const endY = y - 1;
      if (endY - startY + 1 >= 10) {
        lines.push({ x: 0, y: Math.max(0, startY - 2), w: width, h: Math.min(height - startY + 2, endY - startY + 5) });
      }
      inBand = false;
    }
  }
  // tail band
  if (inBand) {
    const endY = height - 1;
    if (endY - startY + 1 >= 10) {
      lines.push({ x: 0, y: Math.max(0, startY - 2), w: width, h: Math.min(height - startY + 2, endY - startY + 5) });
    }
  }

  // Merge very close bands
  const merged: LineBox[] = [];
  for (const lb of lines) {
    const prev = merged[merged.length - 1];
    if (prev && lb.y - (prev.y + prev.h) <= minGap) {
      // merge
      const top = Math.min(prev.y, lb.y);
      const bottom = Math.max(prev.y + prev.h, lb.y + lb.h);
      prev.y = top;
      prev.h = bottom - top;
    } else {
      merged.push({ ...lb });
    }
  }

  // filter too small heights
  const final = merged.filter((l) => l.h >= 12);
  return final;
}

function cropToCanvas(src: HTMLCanvasElement, box: LineBox): HTMLCanvasElement {
  const out = createCanvas(box.w, box.h);
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return out;
}

function normalizeDigits(text: string): string {
  return (text || "").replace(/[^0-9]/g, "");
}

function extractPrefixedSequence(digits: string): string | null {
  // Ép kiểu rõ ràng và dùng ?? để tránh null
  const matches: string[] = digits.match(/(0423\d{9,14}|0424\d{9,14})/g) ?? [];
  if (matches.length === 0) return null;

  // Non-null assertion để tránh 'undefined' khi noUncheckedIndexedAccess bật
  let best = matches[0]!;
  for (const m of matches) {
    if (m.length > best.length) best = m;
  }
  return best;
}

function chooseByVoting(cands: OCRCandidate[]): OCRCandidate | null {
  const valid = cands
    .map((c) => ({ ...c, digits: normalizeDigits(c.raw) }))
    .map((c) => ({ ...c, digits: extractPrefixedSequence(c.digits) || "" }))
    .filter((c) => c.digits.length >= 13);

  if (valid.length === 0) return null;

  // Majority voting by full-string frequency
  const freq = new Map<string, { count: number; maxConf: number }>();
  for (const v of valid) {
    const f = freq.get(v.digits) || { count: 0, maxConf: 0 };
    f.count += 1;
    f.maxConf = Math.max(f.maxConf, v.confidence);
    freq.set(v.digits, f);
  }
  let bestStr = "";
  let bestCount = -1;
  let bestConf = -1;
  for (const [str, { count, maxConf }] of freq.entries()) {
    if (count > bestCount || (count === bestCount && (str.length > bestStr.length || (str.length === bestStr.length && maxConf > bestConf)))) {
      bestStr = str;
      bestCount = count;
      bestConf = maxConf;
    }
  }
  return { raw: bestStr, digits: bestStr, confidence: bestConf };
}

async function ocrOne(
  canvas: HTMLCanvasElement,
  psm: number
): Promise<OCRCandidate> {
  const { data } = await Tesseract.recognize(canvas, "eng", {
    // Keep only digits
    tessedit_char_whitelist: "0123456789",
    user_defined_dpi: "300",
    preserve_interword_spaces: "0",
    tessedit_pageseg_mode: String(psm),
    psm: String(psm),
  } as any);
  const raw = (data?.text || "").toString();
  const conf = typeof data?.confidence === "number" ? data.confidence : 0;
  return { raw, digits: normalizeDigits(raw), confidence: conf };
}

/**
 * Warm up Tesseract engine to reduce first-call latency.
 * It runs a tiny recognition on a 32x16 blank canvas in the background.
 */
export async function warmUpOcr(): Promise<void> {
  try {
    const c = createCanvas(32, 16);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    // Fire and forget
    await Tesseract.recognize(c, "eng", {
      tessedit_char_whitelist: "0123456789",
      psm: "7",
      user_defined_dpi: "150",
    } as any);
  } catch {
    // ignore
  }
}

/**
 * Main entry: Detect asset codes from a single image (Blob or URL).
 * Steps:
 * 1) Grayscale -> baseline threshold
 * 2) Line segmentation via horizontal projection on binary
 * 3) For each line ROI:
 *    - Create 2 variants (grayscale, thresholded)
 *    - OCR with PSM 7 and PSM 11 (single line + sparse)
 *    - Voting/selection
 * 4) Business filtering (0423/0424), dedupe, order by line order
 * 5) Room detection by prefix majority
 */
export async function detectCodesFromImage(input: Blob | string): Promise<OCRPipelineResult> {
  const t0 = performance.now();
  const img = await loadImageFrom(input);
  const baseCanvas = drawImageToCanvas(img);

  // Ensure reasonable scale: upscale small images
  const minHeight = 800;
  let workCanvas = baseCanvas;
  if (baseCanvas.height < minHeight) {
    workCanvas = scaleCanvas(baseCanvas, minHeight);
  }

  // Build grayscale and a baseline binary for segmentation
  const grayData = toGrayscale(getImageData(workCanvas));
  const grayCanvas = createCanvas(workCanvas.width, workCanvas.height);
  putImageData(grayCanvas, grayData);

  const blurred = boxBlur(grayData);
  const binForSeg = threshold(blurred, 170);
  const binCanvas = createCanvas(workCanvas.width, workCanvas.height);
  putImageData(binCanvas, binForSeg);

  // Segment lines on binary image
  const lines = segmentLines(binForSeg);
  const lineRois = lines.map((box) => cropToCanvas(grayCanvas, box)); // use grayscale as base for OCR variants

  const PSM_SINGLE_LINE = 7;
  const PSM_SPARSE = 11;

  const results: string[] = [];
  const confidences: number[] = [];

  for (const roi of lineRois) {
    // Normalize height for OCR
    const targetH = 64;
    const roiScaled = scaleCanvas(roi, targetH);

    // Build 2 variants: grayscale; thresholded@170
    const roiGrayData = toGrayscale(getImageData(roiScaled));
    const roiGrayCanvas = createCanvas(roiScaled.width, roiScaled.height);
    putImageData(roiGrayCanvas, roiGrayData);

    const roiBinData = threshold(roiGrayData, 170);
    const roiBinCanvas = createCanvas(roiScaled.width, roiScaled.height);
    putImageData(roiBinCanvas, roiBinData);

    // OCR on combinations
    const cands: OCRCandidate[] = [];
    // Variant 1: grayscale
    cands.push(await ocrOne(roiGrayCanvas, PSM_SINGLE_LINE));
    cands.push(await ocrOne(roiGrayCanvas, PSM_SPARSE));
    // Variant 2: binary
    cands.push(await ocrOne(roiBinCanvas, PSM_SINGLE_LINE));
    cands.push(await ocrOne(roiBinCanvas, PSM_SPARSE));

    const chosen = chooseByVoting(cands);
    if (chosen?.digits) {
      results.push(chosen.digits);
      confidences.push(chosen.confidence);
    }
  }

  // Dedupe while preserving order
  const seen = new Set<string>();
  const orderedUnique = results.filter((r) => {
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });

  // Detect room from prefixes
  let detectedRoom = "";
  const roomVotes = new Map<string, number>();
  function vote(room: string) {
    if (!room) return;
    roomVotes.set(room, (roomVotes.get(room) || 0) + 1);
  }
  for (const code of orderedUnique) {
    // Map room by prefix
    const p7 = code.slice(0, 7);
    const p6 = code.slice(0, 6);
    if (p7 === "0424201") vote("CMT8");
    else if (p7 === "0424202") vote("NS");
    else if (p7 === "0424203") vote("ĐS");
    else if (p7 === "0424204") vote("LĐH");
    else if (p6 === "042300") vote("DVKH");
    else if (p6 === "042410") vote("QLN");
  }
  for (const [room, cnt] of roomVotes.entries()) {
    if (!detectedRoom || cnt > (roomVotes.get(detectedRoom) || 0)) detectedRoom = room;
  }

  const t1 = performance.now();
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;

  return {
    codes: orderedUnique,
    detectedRoom: detectedRoom || undefined,
    stats: {
      totalLines: lineRois.length,
      keptLines: orderedUnique.length,
      avgConfidence,
      durationMs: Math.round(t1 - t0),
    },
  };
}