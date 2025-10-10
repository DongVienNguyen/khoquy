"use client";

import { supabase } from "@/lib/supabase/client";

export type OtherAssetHistory = {
  id: string;
  created_date: string;
  updated_date: string;
  created_by: string | null;
  asset_id: string;
  asset_name: string;
  old_data: string;
  new_data: string;
  changed_by: string;
  change_type: "update" | "delete";
  change_reason: string | null;
};

const FUNCTION_NAME = "other-assets";

async function call(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) throw new Error(error.message);
  const payload = (data && typeof data === "object" && "data" in (data as any)) ? (data as any).data : data;
  return payload;
}

const OtherAssetHistoryAPI = {
  async list(sort: string = "-created_date"): Promise<OtherAssetHistory[]> {
    const res = await call({ action: "list_history", sort });
    return Array.isArray(res) ? (res as OtherAssetHistory[]) : [];
  },
  async listByAsset(asset_id: string, sort: string = "-created_date"): Promise<OtherAssetHistory[]> {
    const res = await call({ action: "history_by_asset", asset_id, sort });
    return Array.isArray(res) ? (res as OtherAssetHistory[]) : [];
  },
  async create(history: Partial<OtherAssetHistory>): Promise<OtherAssetHistory> {
    const res = await call({ action: "create_history", history });
    return res as OtherAssetHistory;
  },
  async delete(id: string): Promise<boolean> {
    await call({ action: "delete_history", id });
    return true;
  },
};

export default OtherAssetHistoryAPI;