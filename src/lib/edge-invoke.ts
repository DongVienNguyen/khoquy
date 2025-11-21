import { SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/env";

export type EdgeError = { code: "NET-ERR" | "SERVER-ERR" | "PARSE-ERR"; message: string; status?: number };
export type EdgeResult<T = any> = { ok: boolean; data?: T; error?: EdgeError };

export async function edgeInvoke<T = any>(functionName: string, body: Record<string, any>): Promise<EdgeResult<T>> {
  const url = `${SUPABASE_PUBLIC_URL}/functions/v1/${functionName}`;
  // Fetch trực tiếp trước
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLIC_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // Không parse được JSON
      if (res.ok) {
        return { ok: true, data: undefined };
      }
      return { ok: false, error: { code: "PARSE-ERR", message: `Không đọc được phản hồi (HTTP ${res.status})`, status: res.status } };
    }
    if (res.ok) {
      const normalized = json && typeof json === "object" && "data" in json ? json.data : json;
      return { ok: true, data: normalized };
    }
    return {
      ok: false,
      error: {
        code: "SERVER-ERR",
        message: typeof json?.error === "string" ? json.error : `Lỗi máy chủ (HTTP ${res.status})`,
        status: res.status,
      },
    };
  } catch (err: any) {
    // Fallback sang supabase.functions.invoke nếu fetch thất bại (mạng, CORS,...)
  }

  try {
    const { supabase } = await import("@/lib/supabase/client");
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: { Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}` },
    });
    if (!error) {
      const payload: any = data;
      const normalized = payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
      return { ok: true, data: normalized };
    }
    return { ok: false, error: { code: "SERVER-ERR", message: error.message || "Lỗi máy chủ khi gọi function." } };
  } catch (err: any) {
    return { ok: false, error: { code: "NET-ERR", message: err?.message || "Không thể kết nối đến function." } };
  }
}

export function friendlyErrorMessage(err?: EdgeError): string {
  if (!err) return "Có lỗi xảy ra, vui lòng thử lại.";
  // Suy diễn loại lỗi thân thiện
  let friendlyCode: "NET-ERR" | "SERVER-ERR" | "PARSE-ERR" | "RATE-LIMIT" | "VALIDATION" = err.code;
  if (err.code === "SERVER-ERR") {
    if (err.status === 429) friendlyCode = "RATE-LIMIT";
    else if (err.status === 400) friendlyCode = "VALIDATION";
  }
  // Gợi ý thao tác phù hợp
  let tip = "Thử lại sau hoặc liên hệ quản trị.";
  if (friendlyCode === "NET-ERR") {
    tip = "Kiểm tra kết nối mạng và thử lại sau 30s.";
  } else if (friendlyCode === "SERVER-ERR") {
    tip = "Máy chủ đang bận, thử lại sau.";
  } else if (friendlyCode === "PARSE-ERR") {
    tip = "Thử lại sau hoặc tải lại trang.";
  } else if (friendlyCode === "RATE-LIMIT") {
    tip = "Giảm ảnh xuống ≤ 5 tấm, hoặc thử lại sau 30s.";
  } else if (friendlyCode === "VALIDATION") {
    // Gợi ý chung, không nhắc đến mã TS 259.24 nữa
    tip = "Kiểm tra lại dữ liệu đã nhập và thử lại.";
  }
  return `[${friendlyCode}] ${err.message}. ${tip}`;
}