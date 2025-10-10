"use client";

import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";

export type SentCRCReminder = {
  id: string;
  created_date: string;
  updated_date: string;
  created_by: string | null;
  loai_bt_crc: string;
  ngay_thuc_hien: string; // dd-MM
  so_chung_tu?: string | null;
  ten_ts?: string | null;
  ldpcrc?: string | null;
  cbcrc?: string | null;
  quycrc?: string | null;
  sent_date: string; // yyyy-MM-dd
};

const FUNCTION_URL = `${SUPABASE_PUBLIC_URL}/functions/v1/crc-reminders`;

async function call(body: Record<string, any>) {
  try {
    const { data, error } = await supabase.functions.invoke("crc-reminders", {
      body,
      headers: { Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}` },
    });
    if (!error) {
      const payload = data as any;
      return { ok: true, data: "data" in payload ? payload.data : payload };
    }
  } catch {}
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLIC_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json) return { ok: true, data: (json as any).data };
    return { ok: false, error: (json as any)?.error || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Failed" };
  }
}

export const SentCRCReminderAPI = {
  async list(): Promise<SentCRCReminder[]> {
    const res = await call({ action: "list_sent" });
    return (res.ok && Array.isArray(res.data)) ? res.data as SentCRCReminder[] : [];
  },
  async delete(id: string) {
    const res = await call({ action: "delete_sent", id });
    if (!res.ok) throw new Error(String(res.error || "Delete failed"));
    return true;
  },
};

export default SentCRCReminderAPI;