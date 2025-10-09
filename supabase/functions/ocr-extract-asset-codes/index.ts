/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-debug",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OcrImageResult = {
  index: number;
  lines_count: number;
  candidates_count: number;
  codes: string[];
  error?: string;
  raw_042_segments?: string[]; // thêm: chuỗi số thô bắt đầu 042
};

type Diagnostics = {
  correlation_id: string;
  total_images: number;
  accepted_images: number;
  rejected_images: number;
  ocr_time_ms: number;
  payload_bytes: number;
  warnings?: string[];
};

function nowMs() {
  return Date.now();
}

function uuid() {
  try {
    // Deno 1.35+ on Edge supports crypto.randomUUID
    return crypto.randomUUID();
  } catch {
    return `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

function dataUrlToBase64(content: string) {
  const m = content.match(/^data:(image\/(jpeg|png));base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1].toLowerCase(), base64: m[3] };
}

// Verify file signature by magic bytes for JPEG/PNG
function isValidMagicBytes(base64: string, mime: string): boolean {
  const bin = atob(base64);
  if (mime.includes("jpeg")) {
    // JPEG starts with 0xFF 0xD8
    return bin.length >= 2 && bin.charCodeAt(0) === 0xff && bin.charCodeAt(1) === 0xd8;
  }
  if (mime.includes("png")) {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bin.length < sig.length) return false;
    for (let i = 0; i < sig.length; i++) {
      if (bin.charCodeAt(i) !== sig[i]) return false;
    }
    return true;
  }
  return false;
}

function base64Size(base64: string): number {
  // Approximate byte length from base64 length
  // 4 chars => 3 bytes; remove padding "="
  const len = base64.length;
  const padding = (base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0));
  return Math.floor(len * 3 / 4) - padding;
}

function normalizeText(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[|_,]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function mapConfusableChars(input: string): string {
  // Bổ sung kháng lỗi chữ thường
  return input
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Zz]/g, "2");
}

function extractCodesFromText(text: string): { codes: string[]; lines_count: number; candidates_count: number } {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  const lines_count = lines.length;

  const codes = new Set<string>();
  let candidates_count = 0;

  // Strategy 1a: dạng chuẩn X.YY
  const direct = /\b(\d{1,4})\.(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = direct.exec(normalized)) !== null) {
    const codeNum = parseInt(m[1], 10);
    const yearNum = parseInt(m[2], 10);
    if (Number.isFinite(codeNum) && codeNum >= 1 && codeNum <= 9999 && Number.isFinite(yearNum) && yearNum >= 20 && yearNum <= 99) {
      const v = `${codeNum}.${String(yearNum).padStart(2, "0")}`;
      if (!codes.has(v)) {
        codes.add(v);
        candidates_count++;
      }
    }
  }

  // Strategy 1b: hỗ trợ separator linh hoạt (. - / _ hoặc khoảng trắng) và tiền tố TS tùy chọn
  const flexible = /\b(?:TS[\s:\-]*)?(\d{1,4})[\s.\-\/_]{1,3}(\d{2})\b/gi;
  while ((m = flexible.exec(normalized)) !== null) {
    const codeNum = parseInt(m[1], 10);
    const yearNum = parseInt(m[2], 10);
    if (Number.isFinite(codeNum) && codeNum >= 1 && codeNum <= 9999 && Number.isFinite(yearNum) && yearNum >= 20 && yearNum <= 99) {
      const v = `${codeNum}.${String(yearNum).padStart(2, "0")}`;
      if (!codes.has(v)) {
        codes.add(v);
        candidates_count++;
      }
    }
  }

  // Strategy 1c (fallback nếu chưa bắt được gì): nhận dạng đảo chiều YY-X và đổi thành X.YY
  if (codes.size === 0) {
    const flexibleRev = /\b(\d{2})[\s.\-\/_]{1,3}(\d{1,4})\b/gi;
    while ((m = flexibleRev.exec(normalized)) !== null) {
      const yearNum = parseInt(m[1], 10);
      const codeNum = parseInt(m[2], 10);
      if (Number.isFinite(codeNum) && codeNum >= 1 && codeNum <= 9999 && Number.isFinite(yearNum) && yearNum >= 20 && yearNum <= 99) {
        const v = `${codeNum}.${String(yearNum).padStart(2, "0")}`;
        if (!codes.has(v)) {
          codes.add(v);
          candidates_count++;
        }
      }
    }
  }

  // Strategy 1d: các chuỗi bắt đầu bằng 042 (cho phép khoảng trắng/tab/xuống dòng/gạch/chéo/underscore giữa các số)
  // Dùng matchAll với nhóm bắt để luôn lấy đúng phần chuỗi sau 042, rồi gom lại thành chuỗi số liền.
  const prefix042Pattern = /(?:^|[^0-9])(042(?:[ \t\r\n\-\/_]*\d){8,})(?:[^0-9]|$)/g;
  const prefix042Matches = normalized.matchAll(prefix042Pattern);
  for (const match of prefix042Matches) {
    const rawSegment = match[1] ?? match[0];
    const digits = rawSegment.replace(/\D/g, "");
    if (!digits.startsWith("042")) continue;

    // Nếu đủ dài, suy ra X.YY như quy tắc hiện tại; nếu ngắn, bỏ qua để tránh nhiễu.
    if (digits.length >= 12) {
      const yearStr = digits.slice(-10, -8);
      const codeStr = digits.slice(-4);
      const codeNum = parseInt(codeStr, 10);
      const yearNum = parseInt(yearStr, 10);
      if (!Number.isFinite(codeNum) || codeNum <= 0) continue;
      if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) continue;

      const v = `${codeNum}.${String(yearNum).padStart(2, "0")}`;
      if (!codes.has(v)) {
        codes.add(v);
        candidates_count++;
      }
    }
  }

  // Strategy 2: chuỗi số dài (>=12) theo quy tắc đặc tả
  const longSeqs = normalized.match(/\d{12,}/g) || [];
  for (const s of longSeqs) {
    if (s.length < 12) continue;
    const year = s.slice(-10, -8);
    const codeRaw = s.slice(-4);
    const codeNum = parseInt(codeRaw, 10);
    const yearNum = parseInt(year, 10);
    if (!Number.isFinite(codeNum) || codeNum <= 0) continue;
    if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) continue;
    const v = `${codeNum}.${String(yearNum).padStart(2, "0")}`;
    if (!codes.has(v)) {
      codes.add(v);
      candidates_count++;
    }
  }

  // De-dup & sort: tăng dần theo year rồi code
  const sorted = Array.from(codes);
  sorted.sort((a, b) => {
    const [ca, ya] = a.split(".");
    const [cb, yb] = b.split(".");
    const byYear = ya.localeCompare(yb);
    return byYear !== 0 ? byYear : (parseInt(ca, 10) - parseInt(cb, 10));
  });

  return { codes: sorted, lines_count: lines_count, candidates_count };
}

function find042Segments(text: string): string[] {
  const normalized = normalizeText(text);
  const pattern = /(?:^|[^0-9])(042(?:[ \t\r\n\-\/_]*\d){8,})(?:[^0-9]|$)/g;
  const out: string[] = [];
  for (const match of normalized.matchAll(pattern)) {
    const seg = (match[1] ?? match[0]).replace(/\D/g, "");
    if (seg.startsWith("042")) out.push(seg);
  }
  return Array.from(new Set(out));
}

async function ensureBucket(supabase: any, bucketName: string) {
  try {
    const { data } = await supabase.storage.getBucket(bucketName);
    if (!data) {
      await supabase.storage.createBucket(bucketName, { public: false });
    }
  } catch {
    // Try create; ignore if exists
    try {
      await supabase.storage.createBucket(bucketName, { public: false });
    } catch {}
  }
}

async function uploadDebugImage(supabase: any, bucket: string, base64: string, mime: string, path: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: true });
  return !error;
}

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const realIp = req.headers.get("x-real-ip") || "";
  const cfIp = req.headers.get("cf-connecting-ip") || "";
  const fromXf = xf.split(",")[0]?.trim();
  return (fromXf || realIp || cfIp || "").trim() || "unknown";
}

// Add top-level constants used by OCR helpers
const endpointBase = "https://vision.googleapis.com/v1/images:annotate";
const langHints = ["en", "vi"];

// Thêm: tiện ích sleep và hàm gọi OCR có timeout + retry
async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function callVisionOCR(
  apiKey: string,
  base64: string,
  featureType: "TEXT_DETECTION" | "DOCUMENT_TEXT_DETECTION",
  timeoutMs = 12000,
  retries = 1
): Promise<{ ok: boolean; status: number; json: any | null }> {
  const payload = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: featureType }],
        imageContext: { languageHints: langHints },
      },
    ],
  };

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${endpointBase}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(t);

      // Retry khi 429 hoặc 5xx
      if (resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) {
        if (attempt < retries) {
          attempt++;
          await sleep(500 * attempt);
          continue;
        }
      }
      const json = await resp.json().catch(() => null);
      return { ok: resp.ok, status: resp.status, json };
    } catch {
      clearTimeout(t);
      if (attempt < retries) {
        attempt++;
        await sleep(500 * attempt);
        continue;
      }
      return { ok: false, status: 0, json: null };
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = nowMs();
  const correlationId = uuid();

  // Origin allow-list (optional via ALLOWED_ORIGINS comma-separated)
  const origin = req.headers.get("Origin") || "";
  const { ALLOWED_ORIGINS } = Deno.env.toObject();
  const allowedOrigins = (ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const isOriginAllowed = !allowedOrigins.length || (origin && allowedOrigins.includes(origin));
  if (origin && !isOriginAllowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Basic auth: require Authorization header to match anon key
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const bearer = authHeader.replace("Bearer ", "").trim();
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, GOOGLE_VISION_API_KEY } = Deno.env.toObject();

  // Optional apikey header check (if present, must match anon key)
  const apiKeyHeader = req.headers.get("apikey");
  if (apiKeyHeader && SUPABASE_ANON_KEY && apiKeyHeader !== SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured: Supabase env missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!GOOGLE_VISION_API_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured: GOOGLE_VISION_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // minimal check: bearer must match anon key
  if (SUPABASE_ANON_KEY && bearer !== SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) as any;

  // Rate limit IP/giờ
  const MAX_REQ_PER_HOUR = 20;
  const ip = getClientIp(req);
  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setUTCMinutes(0, 0, 0);
  const windowIso = hourStart.toISOString();
  {
    const { data: existing, error: selErr } = await supabase
      .from("ocr_rate_limit")
      .select("count")
      .eq("key", ip)
      .eq("window_start", windowIso)
      .maybeSingle();

    if (selErr) {
      // If rate store fails, we can continue but optionally warn (do not expose details)
    } else if (!existing) {
      const { error: insErr } = await supabase
        .from("ocr_rate_limit")
        .insert([{ key: ip, window_start: windowIso, count: 1 }]);
      if (insErr) {
        // ignore
      }
    } else {
      const current = Number(existing.count || 0);
      if (current >= MAX_REQ_PER_HOUR) {
        return new Response(JSON.stringify({ error: "Too Many Requests" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" },
        });
      }
      const { error: updErr } = await supabase
        .from("ocr_rate_limit")
        .update({ count: current + 1 })
        .eq("key", ip)
        .eq("window_start", windowIso);
      if (updErr) {
        // ignore
      }
    }
  }

  // Parse body
  const body = await req.json().catch(() => null) as { images?: string[] };
  if (!body || !Array.isArray(body.images)) {
    return new Response(JSON.stringify({ error: "Invalid payload: images array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Constraints: 1–4 images; total payload size <= 8MB; mime must be jpeg/png
  const MAX_IMAGES = 4;
  const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8MB
  const images = body.images.slice(0, MAX_IMAGES);
  let totalBytes = 0;
  const parsedImages: Array<{ base64: string; mime: string }> = [];

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const parsed = dataUrlToBase64(item || "");
    if (!parsed) {
      return new Response(JSON.stringify({ error: `Image ${i} is not a valid base64 data URL (jpeg/png)` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!/image\/(jpeg|png)/i.test(parsed.mime)) {
      return new Response(JSON.stringify({ error: `Image ${i} mime must be image/jpeg or image/png` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Magic-bytes verification
    if (!isValidMagicBytes(parsed.base64, parsed.mime)) {
      return new Response(JSON.stringify({ error: `Image ${i} content does not match declared MIME` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const size = base64Size(parsed.base64);
    totalBytes += size;
    parsedImages.push({ base64: parsed.base64, mime: parsed.mime });
  }

  if (images.length < 1) {
    return new Response(JSON.stringify({ error: "At least 1 image required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return new Response(JSON.stringify({ error: `Total payload too large (${Math.round(totalBytes/1024)} KB). Limit is ${Math.round(MAX_TOTAL_BYTES/1024/1024)} MB.` }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Optional debug upload (X-Debug: true)
  const debugEnabled = (req.headers.get("X-Debug") || "").toLowerCase() === "true";
  if (debugEnabled) {
    await ensureBucket(supabase, "ocr-staging");
    const ts = Date.now();
    for (let i = 0; i < parsedImages.length; i++) {
      const ok = await uploadDebugImage(supabase, "ocr-staging", parsedImages[i].base64, parsedImages[i].mime, `debug/${ts}-${correlationId}-${i}.${parsedImages[i].mime.includes("png") ? "png" : "jpg"}`);
      // ignore failures silently
    }
  }

  // Google Vision OCR per image (TEXT_DETECTION), with limited concurrency
  const endpointBase = "https://vision.googleapis.com/v1/images:annotate";
  const langHints = ["en", "vi"];
  const responses: OcrImageResult[] = [];
  const warnings: string[] = [];

  // Thêm: tiện ích sleep và hàm gọi OCR có timeout + retry
  async function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function callVisionOCR(
    apiKey: string,
    base64: string,
    featureType: "TEXT_DETECTION" | "DOCUMENT_TEXT_DETECTION",
    timeoutMs = 12000,
    retries = 1
  ): Promise<{ ok: boolean; status: number; json: any | null }> {
    const payload = {
      requests: [
        {
          image: { content: base64 },
          features: [{ type: featureType }],
          imageContext: { languageHints: langHints },
        },
      ],
    };

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(`${endpointBase}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(t);

        // Retry khi 429 hoặc 5xx
        if (resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) {
          if (attempt < retries) {
            attempt++;
            await sleep(500 * attempt);
            continue;
          }
        }
        const json = await resp.json().catch(() => null);
        return { ok: resp.ok, status: resp.status, json };
      } catch {
        clearTimeout(t);
        if (attempt < retries) {
          attempt++;
          await sleep(500 * attempt);
          continue;
        }
        return { ok: false, status: 0, json: null };
      }
    }
  }

  // simple concurrency control
  const CONCURRENCY = 3;
  let idx = 0;

  async function processOne(index: number) {
    const img = parsedImages[index];

    // Gọi OCR lần 1: TEXT_DETECTION với timeout + retry
    const first = await callVisionOCR(GOOGLE_VISION_API_KEY, img.base64, "TEXT_DETECTION", 12000, 1);
    if (!first.ok) {
      const msg = first.json?.error?.message || "network/timeout";
      warnings.push(`Vision error for image ${index}: ${first.status || "unknown"} - ${msg}`);
      responses.push({ index, lines_count: 0, candidates_count: 0, codes: [], error: `Vision error ${first.status || "timeout"}: ${msg}`, raw_042_segments: [] });
      return;
    }

    let annotation = first.json?.responses?.[0];
    let fullText: string =
      annotation?.fullTextAnnotation?.text ??
      annotation?.textAnnotations?.[0]?.description ??
      "";

    // Fallback: nếu không có text, thử DOCUMENT_TEXT_DETECTION
    if (!fullText || typeof fullText !== "string" || fullText.trim().length === 0) {
      const second = await callVisionOCR(GOOGLE_VISION_API_KEY, img.base64, "DOCUMENT_TEXT_DETECTION", 12000, 0);
      if (second.ok) {
        annotation = second.json?.responses?.[0];
        fullText =
          annotation?.fullTextAnnotation?.text ??
          annotation?.textAnnotations?.[0]?.description ??
          "";
      } else {
        const msg = second.json?.error?.message || "no text detected";
        warnings.push(`Vision fallback error for image ${index}: ${second.status || "unknown"} - ${msg}`);
      }
    }

    if (!fullText || typeof fullText !== "string") {
      responses.push({ index, lines_count: 0, candidates_count: 0, codes: [], error: "No text detected", raw_042_segments: [] });
      return;
    }

    // First pass
    const firstPass = extractCodesFromText(fullText);
    let codes = firstPass.codes;
    let linesCount = firstPass.lines_count;
    let candidatesCount = firstPass.candidates_count;

    // Fallback pass: confusable mapping and try again if empty
    if (codes.length === 0) {
      const mapped = mapConfusableChars(fullText);
      const secondPass = extractCodesFromText(mapped);
      codes = secondPass.codes;
      linesCount = secondPass.lines_count;
      candidatesCount = secondPass.candidates_count;
    }

    const raw042 = find042Segments(fullText);
    responses.push({ index, lines_count: linesCount, candidates_count: candidatesCount, codes, raw_042_segments: raw042 });
  }

  const tasks: Promise<void>[] = [];
  while (idx < parsedImages.length) {
    while (tasks.length < CONCURRENCY && idx < parsedImages.length) {
      tasks.push(processOne(idx));
      idx++;
    }
    await Promise.race(tasks).catch(() => {});
    // remove settled tasks
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      // there's no direct settled check; drain by awaiting one by one
      if (t) {
        await t.catch(() => {});
        tasks.splice(i, 1);
      }
    }
  }
  // finish remaining
  await Promise.all(tasks).catch(() => {});

  // Merge and normalize
  const codeSet = new Set<string>();
  for (const r of responses) {
    for (const c of r.codes) {
      const [codePart, yearPart] = c.split(".");
      const codeNum = parseInt(codePart, 10);
      const yearNum = parseInt(yearPart, 10);
      if (Number.isFinite(codeNum) && codeNum >= 1 && codeNum <= 9999 && Number.isFinite(yearNum) && yearNum >= 20 && yearNum <= 99) {
        codeSet.add(`${codeNum}.${String(yearNum).padStart(2, "0")}`);
      }
    }
  }

  const merged = Array.from(codeSet);
  merged.sort((a, b) => {
    const [ca, ya] = a.split(".");
    const [cb, yb] = b.split(".");
    const byYear = ya.localeCompare(yb);
    return byYear !== 0 ? byYear : (parseInt(ca, 10) - parseInt(cb, 10));
  });

  const t1 = nowMs();
  const diagnostics: Diagnostics = {
    correlation_id: correlationId,
    total_images: parsedImages.length,
    accepted_images: responses.filter((r) => !r.error).length,
    rejected_images: responses.filter((r) => !!r.error).length,
    ocr_time_ms: t1 - t0,
    payload_bytes: totalBytes,
    warnings: warnings.length ? warnings : undefined,
  };

  // Nếu tất cả ảnh đều lỗi OCR, trả về 502 để client hiển thị đúng nguyên nhân
  const allFailed = responses.length > 0 && responses.every((r) => !!r.error);
  if (allFailed) {
    return new Response(JSON.stringify({
      error: "Vision OCR failed for all images",
      diagnostics,
      details: { responses }
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ data: { codes: merged, images: responses, diagnostics } }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});