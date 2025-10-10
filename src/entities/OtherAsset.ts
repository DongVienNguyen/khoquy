"use client";

import { supabase } from "@/lib/supabase/client";

export type OtherAsset = {
  id: string;
  created_date: string;
  updated_date: string;
  created_by: string | null;
  name: string;
  deposit_date: string; // yyyy-MM-dd
  depositor: string | null;
  deposit_receiver: string | null;
  withdrawal_date: string | null;
  withdrawal_deliverer: string | null;
  withdrawal_receiver: string | null;
  notes: string | null;
};

const FUNCTION_NAME = "other-assets";

async function call(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) throw new Error(error.message);
  const payload = (data && typeof data === "object" && "data" in (data as any)) ? (data as any).data : data;
  return payload;
}

const OtherAssetAPI = {
  async list(sort: string = "-created_date"): Promise<OtherAsset[]> {
    const res = await call({ action: "list", sort });
    return Array.isArray(res) ? (res as OtherAsset[]) : [];
  },
  async create(asset: Partial<OtherAsset>): Promise<OtherAsset> {
    const res = await call({ action: "create", asset });
    return res as OtherAsset;
  },
  async update(id: string, patch: Partial<OtherAsset>, opts?: { changed_by: string; change_reason?: string }): Promise<OtherAsset> {
    const res = await call({ action: "update", id, patch, with_history: !!opts, changed_by: opts?.changed_by, change_reason: opts?.change_reason ?? "" });
    return res as OtherAsset;
  },
  async delete(id: string, changed_by: string): Promise<boolean> {
    await call({ action: "delete_asset", id, changed_by });
    return true;
  },
};

export default OtherAssetAPI;