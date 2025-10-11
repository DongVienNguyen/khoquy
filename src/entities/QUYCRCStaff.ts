"use client";

import { supabase } from "@/lib/supabase/client";

export type QUYCRCStaffItem = {
  id: string;
  ten_nv: string;
  email: string;
};

export const QUYCRCStaffAPI = {
  async list(): Promise<QUYCRCStaffItem[]> {
    const { data, error } = await supabase.functions.invoke("crc-reminders", {
      body: { action: "list_quycrc_staff" },
    });
    if (error) throw error;
    const rows = (data?.data ?? []) as QUYCRCStaffItem[];
    return Array.isArray(rows) ? rows : [];
  },
};

export default QUYCRCStaffAPI;