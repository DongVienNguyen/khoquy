"use client";

import { supabase } from "@/lib/supabase/client";

export type CBCRCStaffItem = {
  id: string;
  ten_nv: string;
  email: string;
};

export const CBCRCStaffAPI = {
  async list(): Promise<CBCRCStaffItem[]> {
    const { data, error } = await supabase.functions.invoke("crc-reminders", {
      body: { action: "list_cbcrc_staff" },
    });
    if (error) throw error;
    const rows = (data?.data ?? []) as CBCRCStaffItem[];
    return Array.isArray(rows) ? rows : [];
  },
};

export default CBCRCStaffAPI;