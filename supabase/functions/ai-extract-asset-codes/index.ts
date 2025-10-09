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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => null) as { images?: string[] };

    if (!body || !Array.isArray(body.images) || body.images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load AI settings from system_settings
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
      // Keep defaults
    }

    const provider = settings.default_provider || "custom";
    const model = provider === "openrouter" ? (settings.default_openrouter_model || "openrouter/auto") : (settings.custom_model || "gpt-4o-mini");
    const apiKey = provider === "openrouter" ? (settings.openrouter_api_key || "") : (settings.custom_api_key || "");
    const baseUrl = provider === "openrouter" ? (settings.openrouter_base_url || "https://openrouter.ai/api/v1") : ((settings.custom_base_url || "https://v98store.com").replace(/\/+$/, ""));

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key for selected provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const endpoint = provider === "openrouter" ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const rooms = ["QLN","CMT8","NS","ĐS","LĐH","DVKH"];
    const systemPrompt = `Bạn là trợ lý đọc ảnh để trích xuất mã tài sản. Yêu cầu:
- Phân tích các ảnh đầu vào, trích OCR tất cả chuỗi số liên quan.
- Xác định phòng ban (room) theo prefix:
  0424201 -> CMT8, 0424202 -> NS, 0424203 -> ĐS, 0424204 -> LĐH, 042300 -> DVKH, 042410 -> QLN.
- Từ chuỗi, lấy 2 ký tự năm ở vị trí -10..-8, và 4 ký tự mã cuối cùng, tạo định dạng "code.year" (ví dụ 259.24).
- Chỉ nhận các mã hợp lệ theo định dạng \\d{1,4}.\\d{2}.
- Trả về JSON: {"room": one_of(${rooms.join("|")}) or null, "codes": string[] }.
- Không thêm mô tả ngoài JSON.`;

    const userText = "Hãy trích xuất room và danh sách mã tài sản từ các ảnh sau (trả về JSON thuần).";

    const content: any[] = [{ type: "text", text: userText }];
    for (const dataUrl of body.images) {
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const payload: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: [{ type: "text", text: systemPrompt }] },
        { role: "user", content }
      ],
      temperature: 0,
      max_tokens: 512,
      // Use JSON response if supported
      response_format: { type: "json_object" }
    };

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };
    if (provider === "openrouter") {
      const referer = "https://aytwkszqdnylsbufksmf.supabase.co";
      headers["HTTP-Referer"] = referer;
      headers["X-Title"] = "Asset AI Extractor";
    }

    const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: `Provider error ${resp.status}`, detail: txt }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const json = await resp.json();
    let contentText = json?.choices?.[0]?.message?.content ?? "";
    let parsed: { room?: string | null; codes?: string[] } | null = null;

    if (typeof contentText === "string" && contentText.trim()) {
      try {
        parsed = JSON.parse(contentText);
      } catch {
        // Fallback: try find JSON between braces
        const m = contentText.match(/\{[\s\S]*\}/);
        if (m) {
          try { parsed = JSON.parse(m[0]); } catch {}
        }
      }
    }

    // Final normalization and fallback regex extraction
    let room: string | null = parsed?.room && rooms.includes(parsed.room) ? parsed.room : null;
    let codes: string[] = Array.isArray(parsed?.codes) ? parsed!.codes!.filter((x) => /^\d{1,4}\.\d{2}$/.test(String(x))) : [];

    if (codes.length === 0) {
      const raw = typeof contentText === "string" ? contentText : JSON.stringify(json);
      const matches = raw.match(/\b(\d{1,4}\.\d{2})\b/g) || [];
      codes = Array.from(new Set(matches));
    }

    return new Response(JSON.stringify({ data: { room, codes } }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});