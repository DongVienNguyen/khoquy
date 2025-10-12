import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function requireAdmin(staff_username: string) {
  if (!staff_username) return false
  const { data, error } = await supabase
    .from("staff")
    .select("role, account_status")
    .eq("username", staff_username)
    .limit(1)
  if (error) return false
  const row = data && data[0]
  return row && row.role === "admin" && row.account_status !== "locked"
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  const auth = req.headers.get("Authorization")
  if (!auth) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action: string = String(body?.action || "")
    const staff_username: string = String(body?.staff_username || "")
    const isAdmin = await requireAdmin(staff_username)
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "prune_asset_partitions") {
      const retain_quarters: number = Number(body?.retention_quarters || 4)
      const dry_run: boolean = !!body?.dry_run
      const auto_create_next: boolean = body?.auto_create_next === undefined ? true : !!body?.auto_create_next

      // gọi RPC prune_asset_partitions, sẽ trả về JSONB
      const { data, error } = await supabase.rpc("prune_asset_partitions", {
        retain_quarters,
        auto_create_next,
        dry_run,
      })
      if (error) {
        console.error("prune_asset_partitions rpc error:", error)
        return new Response(JSON.stringify({ ok: false, error: error.message || "RPC error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    return new Response(JSON.stringify({ ok: false, error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error("asset-maintenance error:", e)
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})