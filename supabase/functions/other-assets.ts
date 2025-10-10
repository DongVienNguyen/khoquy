import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, any>;

function ok(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Optional: Require Authorization header but we don't verify here.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({} as Json));
  const action = String(body?.action || "");

  // Helper: order by string "-created_date" or "created_date"
  function applyOrder<T>(q: any, orderStr?: string, defaultKey = "created_date") {
    const raw = typeof orderStr === "string" && orderStr.length > 0 ? orderStr : `-${defaultKey}`;
    const desc = raw.startsWith("-");
    const key = desc ? raw.slice(1) : raw;
    return q.order(key, { ascending: !desc });
  }

  if (action === "list") {
    let q = admin.from("other_assets").select("*");
    q = applyOrder(q, body.sort, "created_date");
    const { data, error } = await q;
    if (error) return err(error.message, 500);
    return ok(data);
  }

  if (action === "list_history") {
    let q = admin.from("other_asset_history").select("*");
    q = applyOrder(q, body.sort, "created_date");
    const { data, error } = await q;
    if (error) return err(error.message, 500);
    return ok(data);
  }

  if (action === "history_by_asset") {
    const assetId = String(body.asset_id || "");
    if (!assetId) return err("asset_id is required");
    let q = admin.from("other_asset_history").select("*").eq("asset_id", assetId);
    q = applyOrder(q, body.sort, "created_date");
    const { data, error } = await q;
    if (error) return err(error.message, 500);
    return ok(data);
  }

  if (action === "create") {
    const asset = body.asset as Json | undefined;
    if (!asset || !asset.name || !asset.deposit_date) return err("Missing required fields");
    const now = new Date().toISOString();
    const toInsert: Json = {
      created_by: asset.created_by ?? null,
      name: asset.name,
      deposit_date: asset.deposit_date,
      depositor: asset.depositor ?? null,
      deposit_receiver: asset.deposit_receiver ?? null,
      withdrawal_date: asset.withdrawal_date || null,
      withdrawal_deliverer: asset.withdrawal_deliverer ?? null,
      withdrawal_receiver: asset.withdrawal_receiver ?? null,
      notes: asset.notes ?? null,
      created_date: now,
      updated_date: now,
    };
    const { data, error } = await admin.from("other_assets").insert(toInsert).select("*").single();
    if (error) return err(error.message, 500);
    return ok(data);
  }

  if (action === "update") {
    const id = String(body.id || "");
    const patch = (body.patch || {}) as Json;
    if (!id) return err("id is required");
    // Fetch old
    const { data: old, error: e1 } = await admin.from("other_assets").select("*").eq("id", id).single();
    if (e1 || !old) return err(e1?.message || "Not found", 404);

    const upd: Json = {
      ...("name" in patch ? { name: patch.name } : {}),
      ...("deposit_date" in patch ? { deposit_date: patch.deposit_date || null } : {}),
      ...("depositor" in patch ? { depositor: patch.depositor ?? null } : {}),
      ...("deposit_receiver" in patch ? { deposit_receiver: patch.deposit_receiver ?? null } : {}),
      ...("withdrawal_date" in patch ? { withdrawal_date: patch.withdrawal_date || null } : {}),
      ...("withdrawal_deliverer" in patch ? { withdrawal_deliverer: patch.withdrawal_deliverer ?? null } : {}),
      ...("withdrawal_receiver" in patch ? { withdrawal_receiver: patch.withdrawal_receiver ?? null } : {}),
      ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
      updated_date: new Date().toISOString(),
    };

    const { data, error } = await admin.from("other_assets").update(upd).eq("id", id).select("*").single();
    if (error) return err(error.message, 500);

    // Optionally write history if provided
    if (body.with_history) {
      const history: Json = {
        asset_id: id,
        asset_name: old.name,
        old_data: JSON.stringify(old),
        new_data: JSON.stringify(data),
        changed_by: String(body.changed_by || "unknown"),
        change_type: "update",
        change_reason: String(body.change_reason || ""),
        created_by: String(body.changed_by || "unknown"),
      };
      await admin.from("other_asset_history").insert(history);
    }

    return ok(data);
  }

  if (action === "delete_asset") {
    const id = String(body.id || "");
    const changedBy = String(body.changed_by || "unknown");
    if (!id) return err("id is required");

    const { data: old, error: e1 } = await admin.from("other_assets").select("*").eq("id", id).single();
    if (e1 || !old) return err(e1?.message || "Not found", 404);

    // Write history first
    const h: Json = {
      asset_id: id,
      asset_name: old.name,
      old_data: JSON.stringify(old),
      new_data: JSON.stringify({}),
      changed_by: changedBy,
      change_type: "delete",
      change_reason: "Xóa tài sản",
      created_by: changedBy,
    };
    await admin.from("other_asset_history").insert(h);

    const { error } = await admin.from("other_assets").delete().eq("id", id);
    if (error) return err(error.message, 500);
    return ok({ success: true });
  }

  if (action === "delete_history") {
    const id = String(body.id || "");
    if (!id) return err("id is required");
    const { error } = await admin.from("other_asset_history").delete().eq("id", id);
    if (error) return err(error.message, 500);
    return ok({ success: true });
  }

  if (action === "create_history") {
    const payload = body.history as Json | undefined;
    if (!payload || !payload.asset_id || !payload.asset_name || !payload.old_data || !payload.new_data || !payload.changed_by || !payload.change_type) {
      return err("Invalid history payload");
    }
    const toInsert = {
      ...payload,
      created_by: payload.changed_by,
    };
    const { data, error } = await admin.from("other_asset_history").insert(toInsert).select("*").single();
    if (error) return err(error.message, 500);
    return ok(data);
  }

  return err("Unknown action", 404);
});