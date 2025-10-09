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

function parseDataUrl(input: string): { mime: string; bytes: Uint8Array } {
  // Hỗ trợ cả data URL lẫn base64 thuần (fallback image/jpeg)
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
  // Base64 thuần
  const b64 = input.includes(",") ? input.split(",").pop()! : input;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: "image/jpeg", bytes };
}

function uuid() {
  // Deno: crypto.randomUUID()
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ymdPath(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function buildSystemPrompt() {
  return `Bạn là trợ lý đọc ảnh trích xuất mã tài sản nhanh và chính xác. TUYỆT ĐỐI KHÔNG ĐOÁN.
Yêu cầu:
1) Với mỗi ảnh, ước lượng tổng số dòng văn bản (lines_count).
2) Ưu tiên tìm các chuỗi số dài (>= 12 ký tự). Từ chuỗi số dài, chuẩn hóa mã tài sản theo quy tắc:
   - Lấy 2 ký tự năm ở vị trí thứ 9 và 10 tính từ phải sang trái (ví dụ "0424102470200259" -> năm "24").
   - Lấy 4 ký tự cuối làm mã thô, loại bỏ số 0 ở đầu để được mã 1-4 chữ số (ví dụ "0259" -> "259").
   - Tạo định dạng "code.year" (ví dụ "259.24").
3) CHỈ nhận mã hợp lệ theo định dạng \\d{1,4}\\.\\d{2}, năm chỉ trong khoảng 20..99. Không suy diễn từ ngày tháng hoặc văn bản khác.
4) Trả về JSON THUẦN có cấu trúc:
{
  "images": [
    { "index": number, "lines_count": number, "codes": string[] }
  ],
  "codes": string[]
}
Không thêm mô tả ngoài JSON.`;
}

function normalizeCodes(inputCodes: string[]): string[] {
  let codes = inputCodes.filter((x) => /^\d{1,4}\.\d{2}$/.test(String(x)));
  // Lọc và chuẩn hóa chặt chẽ
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

function deriveFromRawText(raw: string): string[] {
  // 1) Trực tiếp lấy mẫu X.YY
  const direct = raw.match(/\b(\d{1,4}\.\d{2})\b/g) || [];
  // 2) Phục dựng từ chuỗi số dài
  const longSeqs = raw.match(/\d{12,}/g) || [];
  const derived = new Set<string>();
  for (const s of longSeqs) {
    if (!s || s.length < 12) continue;
    const year = s.slice(-10, -8);
    const codeRaw = s.slice(-4);
    const codeNum = parseInt(codeRaw, 10);
    const yearNum = parseInt(year, 10);
    if (!Number.isFinite(codeNum) || codeNum <= 0) continue;
    if (!Number.isFinite(yearNum) || yearNum < 20 || yearNum > 99) continue;
    const code = String(codeNum);
    const formatted = `${code}.${year}`;
    if (/^\d{1,4}\.\d{2}$/.test(formatted)) derived.add(formatted);
  }
  return Array.from(new Set([...direct, ...Array.from(derived)]));
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

  let uploadedPaths: string[] = [];

  try {
    const body = await req.json().catch(() => null) as { images?: string[] };
    if (!body || !Array.isArray(body.images) || body.images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.images.length > MAX_IMAGES) {
      return new Response(JSON.stringify({ error: `Too many images: max ${MAX_IMAGES}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Đảm bảo bucket tồn tại (private). Nếu đã có thì bỏ qua lỗi tạo.
    try {
      const { data: bData } = await supabase.storage.getBucket(BUCKET);
      if (!bData) {
        await supabase.storage.createBucket(BUCKET, { public: false });
      }
    } catch {
      await supabase.storage.createBucket(BUCKET, { public: false });
    }

    // Upload ảnh vào Storage (private) theo path ngày/uuid
    const now = new Date();
    const basePath = ymdPath(now);
    for (let i = 0; i < body.images.length; i++) {
      const item = body.images[i];
      const { mime, bytes } = parseDataUrl(item);
      if (bytes.length > MAX_IMAGE_BYTES) {
        return new Response(JSON.stringify({ error: `Image ${i + 1} exceeds ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB` }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const safeMime = /^image\/(png|jpeg|jpg|webp)$/i.test(mime) ? mime : "image/jpeg";
      const ext = safeMime.includes("png") ? "png" : (safeMime.includes("webp") ? "webp" : "jpg");
      const key = `${basePath}/${uuid()}_${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, bytes, { contentType: safeMime, upsert: false });
      if (upErr) {
        // Nếu upload lỗi, thử đổi tên một lần
        const fallbackKey = `${basePath}/${uuid()}_${i}.${ext}`;
        const { error: upErr2 } = await supabase.storage.from(BUCKET).upload(fallbackKey, bytes, { contentType: safeMime, upsert: false });
        if (upErr2) throw new Error(`Upload failed for image ${i + 1}`);
        uploadedPaths.push(fallbackKey);
      } else {
        uploadedPaths.push(key);
      }
    }

    // Lấy signed URL ngắn hạn cho từng file
    const signedUrls: string[] = [];
    for (const path of uploadedPaths) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL_SECONDS);
      if (error || !data?.signedUrl) throw new Error("Cannot create signed URL");
      signedUrls.push(data.signedUrl);
    }

    // Đọc AI settings
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
      // dùng defaults
    }

    const provider = settings.default_provider || "custom";
    const model = provider === "openrouter" ? (settings.default_openrouter_model || "openrouter/auto") : (settings.custom_model || "gpt-4o-mini");
    const apiKey = provider === "openrouter" ? (settings.openrouter_api_key || "") : (settings.custom_api_key || "");
    const baseUrl = provider === "openrouter" ? (settings.openrouter_base_url || "https://openrouter.ai/api/v1") : ((settings.custom_base_url || "https://v98store.com").replace(/\/+$/, ""));
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key for selected provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
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

    // Gọi AI theo từng ảnh để tăng độ chính xác
    const perImageResults: Array<{ index: number; lines_count: number; codes: string[] }> = [];
    let allCodes: string[] = [];
    for (let i = 0; i < signedUrls.length; i++) {
      const url = signedUrls[i];
      const userText = "Hãy trích xuất danh sách mã tài sản từ ảnh này (trả về JSON thuần).";
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

      const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
      if (!resp.ok) {
        const txt = await resp.text();
        // Không dừng toàn bộ; tiếp tục ảnh khác, nhưng vẫn ghi nhận lỗi ảnh này
        const fallbackCodes = deriveFromRawText(txt);
        if (fallbackCodes.length) allCodes = Array.from(new Set([...allCodes, ...fallbackCodes]));
        continue;
      }

      const json = await resp.json();
      let contentText = json?.choices?.[0]?.message?.content ?? "";
      let parsed: { images?: Array<{ index?: number; lines_count?: number; codes?: string[] }>; codes?: string[] } | null = null;
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

      // Thu thập theo ảnh
      const imgEntry = { index: i, lines_count: 0, codes: [] as string[] };
      if (Array.isArray(parsed?.images) && parsed!.images!.length > 0) {
        const best = parsed!.images![0];
        imgEntry.lines_count = Number(best?.lines_count ?? 0);
        imgEntry.codes = Array.isArray(best?.codes) ? best!.codes!.filter((x) => /^\d{1,4}\.\d{2}$/.test(String(x))) : [];
      }
      if ((!imgEntry.codes || imgEntry.codes.length === 0) && typeof contentText === "string") {
        const fallback = deriveFromRawText(contentText);
        imgEntry.codes = fallback.filter((x) => /^\d{1,4}\.\d{2}$/.test(String(x)));
      }
      perImageResults.push(imgEntry);
      if (Array.isArray(parsed?.codes)) {
        allCodes = Array.from(new Set([...allCodes, ...parsed!.codes!.filter((x) => /^\d{1,4}\.\d{2}$/.test(String(x))) ]));
      } else if (imgEntry.codes?.length) {
        allCodes = Array.from(new Set([...allCodes, ...imgEntry.codes]));
      }
    }

    // Hợp nhất + chuẩn hóa + sắp xếp
    // Bổ sung fallback từ raw signed URLs string (hầu như không có text)
    const normalized = normalizeCodes(allCodes);

    return new Response(JSON.stringify({ data: { codes: normalized, images: perImageResults } }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    // Thử dọn dẹp nếu có paths đính kèm trong error (không có ở đây)
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    // Dọn dẹp tuyệt đối: xóa mọi file đã upload, kể cả khi return sớm hoặc lỗi
    if (uploadedPaths.length) {
      try {
        await supabase.storage.from(BUCKET).remove(uploadedPaths);
      } catch {
        // ignore cleanup errors
      }
      uploadedPaths = [];
    }
  }
});