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
      // Nếu không parse được JSON
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
  const tip =
    err.code === "NET-ERR"
      ? "Kiểm tra kết nối mạng và thử lại sau 30s."
      : err.code === "SERVER-ERR"
      ? "Máy chủ đang bận, thử lại sau."
      : "Thử lại sau hoặc liên hệ quản trị.";
  return `[${err.code}] ${err.message}. ${tip}`;
}