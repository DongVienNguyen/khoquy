"use client";

import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";

export type CRCReminder = {
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
  is_sent: boolean;
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

export const CRCReminderAPI = {
  async list(): Promise<CRCReminder[]> {
    const res = await call({ action: "list_waiting" });
    return (res.ok && Array.isArray(res.data)) ? res.data as CRCReminder[] : [];
  },
  async create(reminder: Partial<CRCReminder>) {
    const res = await call({ action: "create_reminder", reminder });
    if (!res.ok) throw new Error(String(res.error || "Create failed"));
    return res.data as CRCReminder;
  },
  async update(id: string, patch: Partial<CRCReminder>) {
    const res = await call({ action: "update_reminder", id, patch });
    if (!res.ok) throw new Error(String(res.error || "Update failed"));
    return res.data as CRCReminder;
  },
  async delete(id: string) {
    const res = await call({ action: "delete_reminder", id });
    if (!res.ok) throw new Error(String(res.error || "Delete failed"));
    return true;
  },
  async sendOne(id: string) {
    const res = await call({ action: "send_one", id });
    if (!res.ok) throw new Error(String(res.error || "Send failed"));
    return true;
  },
  async sendToday() {
    const res = await call({ action: "send_batch_today" });
    if (!res.ok) throw new Error(String(res.error || "Send today failed"));
    return res.data;
  },
  async sendAll() {
    const res = await call({ action: "send_batch_all" });
    if (!res.ok) throw new Error(String(res.error || "Send all failed"));
    return res.data;
  },
  async staffSuggestions(): Promise<{ staff_name: string; username: string; email: string | null }[]> {
    const res = await call({ action: "staff_suggestions" });
    return (res.ok && Array.isArray(res.data)) ? res.data as any[] : [];
  },
};

export default CRCReminderAPI;