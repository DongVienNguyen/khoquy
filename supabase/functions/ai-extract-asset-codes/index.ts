/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AISettings = {
  default_provider: "openrouter" | "custom";
  openrouter_api_key?: string | null;
  openrouter_base_url?: string | null;
  default_openrouter_model?: string | null;
  custom_api_key?: string | null;
  custom_base_url?: string | null;
  custom_model?: string | null;
};

const AI_SETTINGS_KEY = "ai_settings_v1";
const DEFAULTS: AISettings = {
  default_provider: "custom",
  openrouter_api_key: "",
  openrouter_base_url: "https://openrouter.ai/api/v1",
  default_openrouter_model: "openrouter/auto",
  custom_api_key: "",
  custom_base_url: "https://v98store.com",
  custom_model: "gpt-4o-mini",
};

const BUCKET = "ai-inputs";
const SIGN_TTL_SECONDS = 300; // 5 phút
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 phút
const RATE_LIMIT_MAX_COUNT = 30; // tối đa 30 ảnh mỗi 5 phút cho mỗi khóa

function parseDataUrl(input: string): { mime: string; bytes: Uint8Array } {
  if (input.startsWith("data:")) {
    const m = input.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error("Invalid data URL");
    const mime = m[1] || "image/jpeg";
    const b64 = m[2] || "";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime, bytes };
  }
  const b64 = input.includes(",") ? input.split(",").pop()! : input;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: "image/jpeg", bytes };
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ymdPath(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function chooseVariant(key: string): "A" | "B" {
  const h = hashString(key || "anon");
  return (h % 2 === 0) ? "A" : "B";
}

function buildSystemPrompt() {
  return `Bạn là trợ lý thị giác chuyên biệt để LIỆT KÊ chuỗi số dài và thông tin tối giản. YÊU CẦU:
- Trả về JSON THUẦN (không thêm mô tả ngoài JSON).
- KHÔNG SUY DIỄN từ ngày/tháng hay văn bản khác. Năm chỉ lấy theo QUY TẮC trên chuỗi số dài, máy chủ sẽ tự áp quy tắc.
- Với mỗi ảnh, trả về:
{
  "images": [
    {
      "index": number,                 // 0-based
      "lines_count": number,           // ước lượng tổng số dòng chữ
      "long_numeric_sequences": string[], // CHỈ gồm các chuỗi số dài (0-9), độ dài tối thiểu 12; không ký tự khác
      "codes": string[],               // nếu phát hiện mã theo định dạng \\d{1,4}\\.\\d{2}; CHỈ để tham chiếu
      "confidence": number             // (tùy chọn) mức tin cậy tổng quan cho ảnh
    }
  ],
  "codes": string[],                   // tổng hợp từ mô hình, có thể trống; CHỈ tham chiếu
  "meta": { "prompt_version": "v2" }
}
Lưu ý:
- Đảm bảo long_numeric_sequences chỉ bao gồm chữ số [0-9], loại bỏ các chuỗi có dấu gạch, dấu chấm, dấu gạch chéo, hoặc ký tự chữ.
- Nếu không có chuỗi số dài, trả về mảng trống cho long_numeric_sequences.
- Phản hồi phải là JSON hợp lệ.`;
}

function normalizeCodes(inputCodes: string[]): string[] {
  let codes = inputCodes.filter((x) => /^\d{1,4}\.\d{2}$/.test(String(x)));
  const normalized = new Set<string>();
  for (const c of codes) {
    const [codePart, yearPart] = String(c).split(".");
    const codeNum = parseInt(codePart, 10);
    const yearNum = parseInt(yearPart, 10);
    if (!Number.isFinite(codeNum) || codeNum < 1 || codeNum > 9999) continue;
    if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) continue;
    normalized.add(`${codeNum}.${String(yearNum).padStart(2, "0")}`);
  }
  const result = Array.from(normalized);
  result.sort((a, b) => {
    const [ca, ya] = a.split(".");
    const [cb, yb] = b.split(".");
    const byYear = ya.localeCompare(yb);
    return byYear !== 0 ? byYear : (parseInt(ca, 10) - parseInt(cb, 10));
  });
  return result;
}

function isDateLikeSequence(seq: string): boolean {
  // Heuristic: any non-digit or presence of separators hint date formats; we keep strictly digits only elsewhere.
  return /[^\d]/.test(seq);
}

function codeFromLongSequence(seq: string): string | null {
  // From right to left: year at positions 9-10; last 4 digits are raw code.
  const s = (seq || "").trim();
  if (!/^\d{12,}$/.test(s)) return null;
  const year = s.slice(-10, -8);
  const codeRaw = s.slice(-4);
  const codeNum = parseInt(codeRaw, 10);
  const yearNum = parseInt(year, 10);
  if (!Number.isFinite(codeNum) || codeNum <= 0) return null;
  if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) return null;
  const code = String(codeNum);
  const formatted = `${code}.${String(yearNum).padStart(2, "0")}`;
  return /^\d{1,4}\.\d{2}$/.test(formatted) ? formatted : null;
}

function extractCodesFromSequences(
  seqs: string[],
  counters?: { invalidYearOrCode: number; shortSeq: number }
): { formatted: string; weight: number }[] {
  const out: { formatted: string; weight: number }[] = [];
  for (const raw of seqs) {
    const seq = String(raw || "").replace(/[^\d]/g, "");
    if (seq.length < 12) {
      if (counters) counters.shortSeq += 1;
      continue;
    }
    // Deterministic parse inline to categorize invalids
    const s = seq;
    const yearStr = s.slice(-10, -8);
    const codeRaw = s.slice(-4);
    const codeNum = parseInt(codeRaw, 10);
    const yearNum = parseInt(yearStr, 10);
    if (!Number.isFinite(codeNum) || codeNum <= 0 || !Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) {
      if (counters) counters.invalidYearOrCode += 1;
      continue;
    }
    const formatted = `${codeNum}.${String(yearNum).padStart(2, "0")}`;
    if (/^\d{1,4}\.\d{2}$/.test(formatted)) {
      out.push({ formatted, weight: s.length });
    }
  }
  return out;
}

function deriveFromRawText(raw: string): string[] {
  // 1) direct format X.YY
  const direct = raw.match(/\b(\d{1,4}\.\d{2})\b/g) || [];
  // 2) reconstruct from long numeric sequences
  const longSeqs = (raw.match(/\d{12,}/g) || []).map((s) => s.replace(/[^\d]/g, ""));
  const derived = new Set<string>();
  for (const s of longSeqs) {
    const formatted = codeFromLongSequence(s);
    if (formatted) derived.add(formatted);
  }
  return Array.from(new Set([...direct, ...Array.from(derived)]));
}

type VoteInput = { code: number; year: number; weight: number };
function voteCodes(items: VoteInput[]): { final: string[]; needsConfirm: { codes: string[]; options: Record<string, string[]> } } {
  // Aggregation: sum weights and track max sequence-derived weight per (code, year)
  const byCodeSum: Record<number, Record<number, number>> = {};
  const byCodeMax: Record<number, Record<number, number>> = {};
  for (const it of items) {
    byCodeSum[it.code] ??= {};
    byCodeMax[it.code] ??= {};
    byCodeSum[it.code][it.year] = (byCodeSum[it.code][it.year] ?? 0) + it.weight;
    byCodeMax[it.code][it.year] = Math.max(byCodeMax[it.code][it.year] ?? 0, it.weight);
  }
  const final: string[] = [];
  const needsCodes: string[] = [];
  const options: Record<string, string[]> = {};
  for (const codeStr of Object.keys(byCodeSum)) {
    const code = parseInt(codeStr, 10);
    const yearsSum = byCodeSum[code];
    const yearsMax = byCodeMax[code];
    const entries = Object.keys(yearsSum).map((y) => ({
      year: parseInt(y, 10),
      weight: yearsSum[parseInt(y, 10)],
      maxW: yearsMax[parseInt(y, 10)] ?? 0
    }));
    entries.sort((a, b) => b.weight - a.weight || b.maxW - a.maxW || a.year - b.year);
    if (entries.length === 0) continue;
    if (entries.length > 1 && entries[0].weight === entries[1].weight && entries[0].maxW === entries[1].maxW) {
      // Still tie after considering longest sequence → needs confirmation
      needsCodes.push(String(code));
      options[String(code)] = entries.map((e) => `${code}.${String(e.year).padStart(2, "0")}`);
    } else {
      final.push(`${code}.${String(entries[0].year).padStart(2, "0")}`);
    }
  }
  final.sort((a, b) => {
    const [ca, ya] = a.split(".");
    const [cb, yb] = b.split(".");
    const byYear = ya.localeCompare(yb);
    return byYear !== 0 ? byYear : (parseInt(ca, 10) - parseInt(cb, 10));
  });
  return { final, needsConfirm: { codes: needsCodes, options } };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) as any;

  const tStart = Date.now();
  let uploadedPaths: string[] = [];
  const imageSizes: number[] = [];
  const aiDurations: number[] = [];

  try {
    const body = await req.json().catch(() => null) as { images?: string[]; rate_limit_key?: string };
    if (!body || !Array.isArray(body.images) || body.images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.images.length > MAX_IMAGES) {
      return new Response(JSON.stringify({ error: `Too many images: max ${MAX_IMAGES}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rate limit per key
    const rateKey = String(body.rate_limit_key || "anon");
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const { data: rlRow } = await supabase
      .from("ocr_rate_limit")
      .select("*")
      .eq("key", rateKey)
      .limit(1)
      .maybeSingle();
    let rlAllowed = true;
    let rlCountBefore = 0;
    let rlWindowStartIso = nowIso;
    if (rlRow) {
      const ws = new Date(rlRow.window_start).getTime();
      const withinWindow = nowMs - ws < RATE_LIMIT_WINDOW_MS;
      rlCountBefore = Number(rlRow.count || 0);
      rlWindowStartIso = rlRow.window_start;
      if (withinWindow && rlCountBefore + body.images.length > RATE_LIMIT_MAX_COUNT) {
        rlAllowed = false;
      }
    }
    if (!rlAllowed) {
      try { console.log(JSON.stringify({ event: "ai_rate_limit_block", key: rateKey, count_before: rlCountBefore, requested: body.images.length })); } catch {}
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!rlRow || (nowMs - new Date(rlRow.window_start).getTime() >= RATE_LIMIT_WINDOW_MS)) {
      await supabase.from("ocr_rate_limit").upsert({ key: rateKey, window_start: nowIso, count: body.images.length });
      rlWindowStartIso = nowIso;
      rlCountBefore = 0;
    } else {
      await supabase.from("ocr_rate_limit").update({ count: rlCountBefore + body.images.length }).eq("key", rateKey);
    }

    // Ensure bucket
    try {
      const { data: bData } = await supabase.storage.getBucket(BUCKET);
      if (!bData) {
        await supabase.storage.createBucket(BUCKET, { public: false });
      }
    } catch {
      await supabase.storage.createBucket(BUCKET, { public: false });
    }

    // Upload images
    const now = new Date();
    const basePath = ymdPath(now);
    for (let i = 0; i < body.images.length; i++) {
      const item = body.images[i];
      const { mime, bytes } = parseDataUrl(item);
      imageSizes.push(bytes.length);
      if (bytes.length > MAX_IMAGE_BYTES) {
        return new Response(JSON.stringify({ error: `Image ${i + 1} exceeds ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB` }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const safeMime = /^image\/(png|jpeg|jpg|webp)$/i.test(mime) ? mime : "image/jpeg";
      const ext = safeMime.includes("png") ? "png" : (safeMime.includes("webp") ? "webp" : "jpg");
      const key = `${basePath}/${uuid()}_${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, bytes, { contentType: safeMime, upsert: false });
      if (upErr) {
        const fallbackKey = `${basePath}/${uuid()}_${i}.${ext}`;
        const { error: upErr2 } = await supabase.storage.from(BUCKET).upload(fallbackKey, bytes, { contentType: safeMime, upsert: false });
        if (upErr2) throw new Error(`Upload failed for image ${i + 1}`);
        uploadedPaths.push(fallbackKey);
      } else {
        uploadedPaths.push(key);
      }
    }
    const tAfterUpload = Date.now();

    // Signed URLs
    const signedUrls: string[] = [];
    for (const path of uploadedPaths) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL_SECONDS);
      if (error || !data?.signedUrl) throw new Error("Cannot create signed URL");
      signedUrls.push(data.signedUrl);
    }
    const tAfterSign = Date.now();

    // Load AI settings
    let settings: AISettings = DEFAULTS;
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", AI_SETTINGS_KEY)
        .limit(1)
        .maybeSingle();
      if (data?.setting_value) {
        const parsed = JSON.parse(data.setting_value);
        if (parsed && typeof parsed === "object") {
          settings = { ...DEFAULTS, ...parsed };
        }
      }
    } catch {
      // use defaults
    }

    const provider = settings.default_provider || "custom";
    const apiKey = provider === "openrouter" ? (settings.openrouter_api_key || "") : (settings.custom_api_key || "");
    const baseUrl = provider === "openrouter" ? (settings.openrouter_base_url || "https://openrouter.ai/api/v1") : ((settings.custom_base_url || "https://v98store.com").replace(/\/+$/, ""));
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key for selected provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // A/B model selection
    const variant = chooseVariant(rateKey);
    const modelA = provider === "openrouter" ? (settings.default_openrouter_model || "openrouter/auto") : (settings.custom_model || "gpt-4o-mini");
    const modelB = provider === "openrouter" ? "openai/gpt-4o" : "gpt-4o";
    const model = (variant === "A" ? modelA : modelB);

    const endpoint = provider === "openrouter" ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    const systemPrompt = buildSystemPrompt();

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };
    if (provider === "openrouter") {
      const referer = `${SUPABASE_URL}`;
      headers["HTTP-Referer"] = referer;
      headers["X-Title"] = "Asset AI Extractor (URL mode)";
    }

    type ImageResult = { index: number; lines_count: number; long_numeric_sequences: string[]; codes: string[]; confidence?: number };
    const perImageResults: ImageResult[] = [];
    const votePool: VoteInput[] = [];
    let allCodesFromModel: string[] = [];
    let removedDatePattern = 0;
    let longSeqTotal = 0;
    let invalidYearOrCode = 0;
    const confidences: number[] = [];

    for (let i = 0; i < signedUrls.length; i++) {
      const url = signedUrls[i];
      const userText = "Hãy trả về JSON thuần theo hợp đồng đã mô tả. Chỉ liệt kê long_numeric_sequences gồm toàn số (0-9) dài >= 12, không thêm ký tự khác.";
      const payload: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: [{ type: "text", text: systemPrompt }] },
          { role: "user", content: [{ type: "text", text: userText }, { type: "image_url", image_url: { url } }] }
        ],
        temperature: 0,
        max_tokens: 512,
        response_format: { type: "json_object" }
      };
      const tAiStart = Date.now();
      const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
      const tAiEnd = Date.now();
      aiDurations.push(tAiEnd - tAiStart);

      let contentText = "";
      let parsed: any = null;
      if (resp.ok) {
        const json = await resp.json();
        contentText = json?.choices?.[0]?.message?.content ?? "";
        if (typeof contentText === "string" && contentText.trim()) {
          try {
            parsed = JSON.parse(contentText);
          } catch {
            const m = contentText.match(/\{[\s\S]*\}/);
            if (m) {
              try { parsed = JSON.parse(m[0]); } catch {}
            }
          }
        }
      } else {
        const txt = await resp.text();
        contentText = txt || "";
      }

      // Build per image result with fallback
      const entry: ImageResult = { index: i, lines_count: 0, long_numeric_sequences: [], codes: [], confidence: 0 };
      if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
        const img0 = parsed.images[0];
        entry.lines_count = Number(img0?.lines_count ?? 0);
        const confRaw = Number(img0?.confidence ?? 0);
        const conf = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;
        entry.confidence = conf;
        confidences.push(conf);
        const seqs = Array.isArray(img0?.long_numeric_sequences) ? img0.long_numeric_sequences.map((s: any) => String(s || "")) : [];
        const cleanSeqs = seqs.filter((s: string) => /^\d{12,}$/.test(s));
        removedDatePattern += seqs.length - cleanSeqs.length;
        entry.long_numeric_sequences = cleanSeqs;
        const codesFromModel = Array.isArray(img0?.codes) ? img0.codes.filter((x: any) => /^\d{1,4}\.\d{2}$/.test(String(x))) : [];
        entry.codes = codesFromModel;
        longSeqTotal += cleanSeqs.length;
      } else {
        // Fallback: try to parse from contentText
        const fallbackSeqs = (contentText.match(/\d{12,}/g) || []).map((s) => s.replace(/[^\d]/g, ""));
        entry.long_numeric_sequences = fallbackSeqs.filter((s) => /^\d{12,}$/.test(s));
        const fallbackCodes = deriveFromRawText(contentText);
        entry.codes = fallbackCodes.filter((x) => /^\d{1,4}\.\d{2}$/.test(String(x)));
        longSeqTotal += entry.long_numeric_sequences.length;
      }
      perImageResults.push(entry);

      // Deterministic extraction from long sequences
      const extracted = extractCodesFromSequences(entry.long_numeric_sequences, { invalidYearOrCode, shortSeq: 0 });
      // Update invalidYearOrCode counter from the temp container
      invalidYearOrCode = (extracted as any).invalidYearOrCode ?? invalidYearOrCode;
      for (const ex of extracted) {
        const [codePart, yearPart] = ex.formatted.split(".");
        const codeNum = parseInt(codePart, 10);
        const yearNum = parseInt(yearPart, 10);
        const conf = typeof entry.confidence === "number" ? Math.min(1, Math.max(0, entry.confidence)) : 0;
        const weighted = ex.weight * (1 + conf);
        votePool.push({ code: codeNum, year: yearNum, weight: weighted });
      }

      // Collect model-provided codes for reference (not trusted)
      if (parsed && Array.isArray(parsed.codes)) {
        const refCodes = parsed.codes.filter((x: any) => /^\d{1,4}\.\d{2}$/.test(String(x)));
        allCodesFromModel = Array.from(new Set([...allCodesFromModel, ...refCodes]));
      } else if (entry.codes.length) {
        allCodesFromModel = Array.from(new Set([...allCodesFromModel, ...entry.codes]));
      }
    }

    // Voting across images
    const voteResult = voteCodes(votePool);
    const normalizedFinal = normalizeCodes(voteResult.final);

    const metrics = {
      event: "ai_extract_asset_codes_metrics_v2",
      ab_variant: variant,
      provider,
      model,
      temperature: 0,
      images_count: imageSizes.length,
      avg_image_bytes: imageSizes.length ? Math.round(imageSizes.reduce((a, b) => a + b, 0) / imageSizes.length) : 0,
      sign_ttl_seconds: SIGN_TTL_SECONDS,
      upload_ms: tAfterUpload - tStart,
      sign_ms: tAfterSign - tAfterUpload,
      ai_ms_total: aiDurations.reduce((a, b) => a + b, 0),
      ai_ms_per_image: aiDurations,
      long_sequences_total: longSeqTotal,
      removed_due_to_date_like: removedDatePattern,
      invalid_year_or_code: invalidYearOrCode,
      avg_confidence: confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100 : null,
      codes_count_final: normalizedFinal.length,
      needs_confirmation_count: voteResult.needsConfirm.codes.length,
      rate_limit: { key: rateKey, window_start: rlWindowStartIso, count_before: rlCountBefore }
    };
    try { console.log(JSON.stringify(metrics)); } catch {}

    const data = {
      codes: normalizedFinal,
      images: perImageResults,
      needs_confirmation: voteResult.needsConfirm,
      meta: { ab_variant: variant, provider, model, temperature: 0, prompt_version: "v2" }
    };

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (uploadedPaths.length) {
      const toRemove = [...uploadedPaths];
      let cleanupOk = true;
      try {
        await supabase.storage.from(BUCKET).remove(toRemove);
      } catch {
        cleanupOk = false;
      }
      try {
        console.log(JSON.stringify({
          event: "ai_extract_asset_codes_cleanup",
          removed_count: toRemove.length,
          ok: cleanupOk
        }));
      } catch {}
      uploadedPaths = [];
    }
  }
});