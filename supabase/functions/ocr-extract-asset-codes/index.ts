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

function base64Size(base64: string): number {
  // Approximate byte length from base64 length
  // 4 chars => 3 bytes; remove padding "="
  const len = base64.length;
  const padding = (base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0));
  return Math.floor(len * 3 / 4) - padding;
}

function normalizeText(input: string): string {
  return input.replace(/\r/g, "").trim();
}

function mapConfusableChars(input: string): string {
  // Fallback mapping common OCR confusions
  return input
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/S/g, "5")
    .replace(/Z/g, "2");
}

function extractCodesFromText(text: string): { codes: string[]; lines_count: number; candidates_count: number } {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  const lines_count = lines.length;

  const codes = new Set<string>();
  let candidates_count = 0;

  // Strategy 1: direct matches like X.YY
  const directMatches = normalized.match(/\b(\d{1,4}\.\d{2})\b/g) || [];
  for (const m of directMatches) {
    const [codePart, yearPart] = m.split(".");
    const codeNum = parseInt(codePart, 10);
    const yearNum = parseInt(yearPart, 10);
    if (Number.isFinite(codeNum) && codeNum >= 1 && codeNum <= 9999 && Number.isFinite(yearNum) && yearNum >= 20 && yearNum <= 99) {
      codes.add(`${codeNum}.${String(yearNum).padStart(2, "0")}`);
      candidates_count++;
    }
  }

  // Strategy 2: long numeric sequences (>=12 chars)
  const longSeqs = normalized.match(/\d{12,}/g) || [];
  for (const s of longSeqs) {
    if (s.length < 12) continue;
    const year = s.slice(-10, -8);
    const codeRaw = s.slice(-4);
    const codeNum = parseInt(codeRaw, 10);
    const yearNum = parseInt(year, 10);
    if (!Number.isFinite(codeNum) || codeNum <= 0) continue;
    if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) continue;
    codes.add(`${codeNum}.${String(yearNum).padStart(2, "0")}`);
    candidates_count++;
  }

  // De-dup and sort by (year, code)
  const sorted = Array.from(codes);
  sorted.sort((a, b) => {
    const [ca, ya] = a.split(".");
    const [cb, yb] = b.split(".");
    const byYear = ya.localeCompare(yb);
    return byYear !== 0 ? byYear : (parseInt(ca, 10) - parseInt(cb, 10));
  });

  return { codes: sorted, lines_count, candidates_count };
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = nowMs();
  const correlationId = uuid();

  // Basic auth: require Authorization header to match anon key
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const bearer = authHeader.replace("Bearer ", "").trim();
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, GOOGLE_VISION_API_KEY } = Deno.env.toObject();

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // simple concurrency control
  const CONCURRENCY = 3;
  let idx = 0;

  async function processOne(index: number) {
    const img = parsedImages[index];
    const payload = {
      requests: [
        {
          image: { content: img.base64 },
          features: [{ type: "TEXT_DETECTION" }],
          imageContext: { languageHints: langHints },
        },
      ],
    };

    const resp = await fetch(`${endpointBase}?key=${GOOGLE_VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      warnings.push(`Vision error for image ${index}: ${resp.status}`);
      responses.push({ index, lines_count: 0, candidates_count: 0, codes: [], error: `Vision error ${resp.status}` });
      return;
    }

    const json = await resp.json();
    const annotation = json?.responses?.[0];
    const fullText: string =
      annotation?.fullTextAnnotation?.text ??
      annotation?.textAnnotations?.[0]?.description ??
      "";

    if (!fullText || typeof fullText !== "string") {
      responses.push({ index, lines_count: 0, candidates_count: 0, codes: [], error: "No text detected" });
      return;
    }

    // First pass
    const first = extractCodesFromText(fullText);
    let codes = first.codes;
    let linesCount = first.lines_count;
    let candidatesCount = first.candidates_count;

    // Fallback pass: confusable mapping and try again if empty
    if (codes.length === 0) {
      const mapped = mapConfusableChars(fullText);
      const second = extractCodesFromText(mapped);
      codes = second.codes;
      linesCount = second.lines_count;
      candidatesCount = second.candidates_count;
    }

    responses.push({ index, lines_count: linesCount, candidates_count: candidatesCount, codes });
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

  return new Response(JSON.stringify({ data: { codes: merged, images: responses, diagnostics } }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});