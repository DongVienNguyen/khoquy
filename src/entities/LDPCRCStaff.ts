"use client";

import { supabase } from "@/lib/supabase/client";

export type LDPCRCStaffItem = {
  id: string;
  ten_nv: string;
  email: string;
};

export const LDPCRCStaffAPI = {
  async list(): Promise<LDPCRCStaffItem[]> {
    const { data, error } = await supabase.functions.invoke("crc-reminders", {
      body: { action: "list_ldpcrc_staff" },
    });
    if (error) throw error;
    const rows = (data?.data ?? []) as LDPCRCStaffItem[];
    return Array.isArray(rows) ? rows : [];
  },
};

export default LDPCRCStaffAPI;