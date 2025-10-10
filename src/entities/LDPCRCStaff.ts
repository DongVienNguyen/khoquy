"use client";

import { supabase } from "@/lib/supabase/client";

export type LDPCRCStaffItem = {
  id: string;
  ten_nv: string;
  email: string;
};

export const LDPCRCStaffAPI = {
  async list(): Promise<LDPCRCStaffItem[]> {
    const { data, error } = await supabase
      .from("ldpcrc_staff")
      .select("id, ten_nv, email")
      .order("ten_nv", { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? (data as LDPCRCStaffItem[]) : [];
  },
};

export default LDPCRCStaffAPI;