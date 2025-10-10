"use client";

import { supabase } from "@/lib/supabase/client";

export type QUYCRCStaffItem = {
  id: string;
  ten_nv: string;
  email: string;
};

export const QUYCRCStaffAPI = {
  async list(): Promise<QUYCRCStaffItem[]> {
    const { data, error } = await supabase
      .from("quycrc_staff")
      .select("id, ten_nv, email")
      .order("ten_nv", { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? (data as QUYCRCStaffItem[]) : [];
  },
};

export default QUYCRCStaffAPI;