"use client";

import { supabase } from "@/lib/supabase/client";

export type CBCRCStaffItem = {
  id: string;
  ten_nv: string;
  email: string;
};

export const CBCRCStaffAPI = {
  async list(): Promise<CBCRCStaffItem[]> {
    const { data, error } = await supabase
      .from("cbcrc_staff")
      .select("id, ten_nv, email")
      .order("ten_nv", { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? (data as CBCRCStaffItem[]) : [];
  },
};

export default CBCRCStaffAPI;