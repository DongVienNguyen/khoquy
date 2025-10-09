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

function normalizeDigits(text: string): string {
  return (text || "").replace(/[^0-9]/g, "");
}

function extractPrefixedSequence(digits: string): string | null {
  const matches: string[] = digits.match(/(0423\d{9,14}|0424\d{9,14})/g) ?? [];
  if (matches.length === 0) return null;
  let best = matches[0]!;
  for (const m of matches) {
    if (m.length > best.length) best = m;
  }
  return best;
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

async function ocrOne(canvas: HTMLCanvasElement, psm: number): Promise<OCRCandidate> {
  const { data } = await Tesseract.recognize(canvas, "eng", {
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
  for (let ang = -5; ang <= 5; ang += 0.5) {
    const rotated = rotateCanvas(baseCanvas, ang);
    const rd = toGrayscale(getImageData(rotated));
    const bin = threshold(rd, 170);
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
  // Báo cáo bước normalize để người dùng thấy tiến trình
  onProgress?.({ phase: "normalize", current: 1, total: 1, detail: "Chuẩn hóa ảnh cho phân đoạn" });

  // Cắt theo 3 cột có mật độ số cao + toàn khung
  const columnCanvases = cropTopColumns(binForProj, deskewed, 3);

  // Xây dựng binary cho từng cột và tách dòng
  const lineRois: HTMLCanvasElement[] = [];
  for (const columnCanvas of columnCanvases) {
    const grayData = toGrayscale(getImageData(columnCanvas));
    const blurred = boxBlur(grayData);
    const tOtsu = otsuThreshold(blurred);
    const binForSeg = threshold(blurred, tOtsu);
    const lines = segmentLines(binForSeg, 1);
    let rois = lines.map((box) => cropToCanvas(columnCanvas, box));
    if (typeof maxLines === "number" && maxLines > 0) {
      rois = rois.slice(0, Math.max(1, maxLines - lineRois.length));
    }
    lineRois.push(...rois);
  }

  onProgress?.({ phase: "segment", current: lineRois.length, total: lineRois.length, detail: `Tách ${lineRois.length} dòng` });

  const results: string[] = [];
  const confidences: number[] = [];
  const droppedIndices: number[] = [];

  const total = lineRois.length;
  let done = 0;

  // helper xử lý 1 dòng
  const processOne = async (roi: HTMLCanvasElement) => {
    // Normalize height for OCR
    const targetH = 96;
    const roiScaled = scaleCanvas(roi, targetH);

    // Variants: grayscale, gamma(0.8/1.2), thresholds (Otsu, 160, 190)
    const roiGray = toGrayscale(getImageData(roiScaled));
    const roiGrayCanvas = createCanvas(roiScaled.width, roiScaled.height);
    putImageData(roiGrayCanvas, roiGray);

    const roiGamma08 = applyGamma(roiGray, 0.8);
    const roiGamma12 = applyGamma(roiGray, 1.2);

    const tOtsuRoi = otsuThreshold(roiGray);
    const roiBinOtsu = threshold(roiGray, tOtsuRoi);
    const roiBin160 = threshold(roiGray, 160);
    const roiBin190 = threshold(roiGray, 190);

    const canvases: HTMLCanvasElement[] = [];
    const pushDataCanvas = (d: ImageData) => {
      const c = createCanvas(roiScaled.width, roiScaled.height);
      putImageData(c, d);
      canvases.push(c);
    };

    // Turbo: ít biến thể hơn để nhanh
    if (turbo) {
      pushDataCanvas(roiGray);
      pushDataCanvas(roiBinOtsu);
      pushDataCanvas(roiBin160);
    } else {
      pushDataCanvas(roiGray);
      pushDataCanvas(roiGamma08);
      pushDataCanvas(roiGamma12);
      pushDataCanvas(roiBinOtsu);
      pushDataCanvas(roiBin160);
      pushDataCanvas(roiBin190);
    }

    const PSM7 = 7;
    const PSM11 = 11;
    // Thử thêm các PSM khi không bật Turbo để đa dạng chiến lược:
    const PSM6 = 6;   // single block of text
    const PSM13 = 13; // raw line

    // Run OCR in parallel for each variant × 2/4 PSM
    const jobs: Promise<OCRCandidate>[] = [];
    for (const c of canvases) {
      jobs.push(ocrOne(c, PSM7));
      jobs.push(ocrOne(c, PSM11));
      if (!turbo) {
        jobs.push(ocrOne(c, PSM6));
        jobs.push(ocrOne(c, PSM13));
      }
    }
    const candsRaw = await Promise.all(jobs);

    // Normalize and filter candidates
    const normalizedStrings = candsRaw
      .map((c) => extractPrefixedSequence(normalizeDigits(c.raw)))
      .filter((s): s is string => !!s && s.length >= 13);

    let chosenStr: string | null = null;
    let chosenConf = 0;

    if (normalizedStrings.length > 0) {
      // Per-char voting
      const voted = votePerChar(normalizedStrings);
      if (voted) {
        chosenStr = voted;
      } else {
        // fallback: majority full-string
        const freq = new Map<string, { count: number; maxConf: number }>();
        for (const c of candsRaw) {
          const s = extractPrefixedSequence(normalizeDigits(c.raw));
          if (!s) continue;
          const f = freq.get(s) || { count: 0, maxConf: 0 };
          f.count += 1;
          f.maxConf = Math.max(f.maxConf, c.confidence);
          freq.set(s, f);
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
        chosenStr = bestStr || null;
      }
      // Confidence estimate: average of candidates matching chosenStr
      const matches = candsRaw.filter((c) => extractPrefixedSequence(normalizeDigits(c.raw)) === chosenStr);
      chosenConf = matches.length ? matches.reduce((a, b) => a + (b.confidence || 0), 0) / matches.length : 0;
    }

    // Fallback pass if low confidence
    if (!chosenStr || chosenConf < 60) {
      const roiBlurred = boxBlur(roiGray);
      const roiBinAlt = threshold(roiBlurred, Math.max(100, tOtsuRoi - 10));
      const altCanvas = createCanvas(roiScaled.width, roiScaled.height);
      putImageData(altCanvas, roiBinAlt);
      const altCands = await Promise.all([ocrOne(altCanvas, PSM7), ocrOne(altCanvas, PSM11)]);
      const altStrings = altCands.map((c) => extractPrefixedSequence(normalizeDigits(c.raw))).filter((s): s is string => !!s && s.length >= 13);
      const altVoted = votePerChar(altStrings);
      if (altVoted) {
        chosenStr = altVoted;
        chosenConf = Math.max(...altCands.map((c) => c.confidence || 0));
      }
    }

    return { chosenStr, chosenConf };
  };

  onProgress?.({ phase: "recognize", current: 0, total, detail: "Nhận dạng các dòng" });
  for (let i = 0; i < total; i += batchSize) {
    const batch = lineRois.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((roi) => processOne(roi)));
    batchResults.forEach((br, idx) => {
      const lineIndex = i + idx;
      if (br.chosenStr) {
        results.push(br.chosenStr);
        confidences.push(br.chosenConf || 0);
      } else {
        droppedIndices.push(lineIndex);
      }
      done += 1;
      onProgress?.({ phase: "recognize", current: done, total, detail: `Nhận dạng dòng ${done}/${total}` });
    });
  }

  // Dedupe while preserving order
  // Không lọc trùng: giữ nguyên theo từng dòng để đúng tổng số dòng
  const orderedAll = results.slice();
  onProgress?.({ phase: "vote", current: orderedAll.length, total: total, detail: "Ghép kết quả theo từng dòng" });

  // Detect room by prefixes
  let detectedRoom = "";
  const roomVotes = new Map<string, number>();
  const vote = (room: string) => roomVotes.set(room, (roomVotes.get(room) || 0) + 1);

  for (const code of orderedAll) {
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
  const variantsTriedPerLine = (turbo ? 3 : 6) * (turbo ? 2 : 4);

  onProgress?.({ phase: "done", current: orderedAll.length, total: total, detail: "Điền mã" });

  return {
    codes: orderedAll,
    detectedRoom: detectedRoom || undefined,
    stats: {
      totalLines: lineRois.length,
      keptLines: orderedAll.length,
      avgConfidence,
      durationMs: Math.round(t1 - t0),
      droppedIndices,
      variantsTriedPerLine, // variants * PSM
    },
  };
}