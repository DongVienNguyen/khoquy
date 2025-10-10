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

const ALLOWED_TABLES = new Set([
  "staff",
  "email_users",
  "notifications",
  "processed_notes",
  "taken_asset_status",
  "system_settings",
])

type DateCols = { created?: string; updated?: string }
const TABLE_DATE_COLUMNS: Record<string, DateCols> = {
  staff: { created: "created_date", updated: "updated_date" },
  email_users: { created: "created_date", updated: "updated_date" },
  notifications: { created: "created_at" }, // notifications có created_at
  processed_notes: { created: "created_date", updated: "updated_date" },
  taken_asset_status: { created: "created_date", updated: "updated_date" },
  system_settings: { created: "created_date", updated: "updated_date" },
}

function nowIso() { return new Date().toISOString() }

function applyDateColumns(table: string, record: any, isInsert: boolean) {
  const cfg = TABLE_DATE_COLUMNS[table]
  if (!cfg) return record
  const patched = { ...record }
  if (isInsert) {
    if (cfg.created && patched[cfg.created] === undefined) patched[cfg.created] = nowIso()
    if (cfg.updated && patched[cfg.updated] === undefined) patched[cfg.updated] = nowIso()
  } else {
    if (cfg.updated) patched[cfg.updated] = nowIso()
  }
  return patched
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action: string = String(body?.action || "")
    const table: string = String(body?.table || "")
    if (!ALLOWED_TABLES.has(table)) {
      return new Response(JSON.stringify({ ok: false, error: "Bảng không được phép." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "list_all") {
      const orderBy = typeof body?.orderBy === "string" ? body.orderBy : null
      const ascending = body?.ascending !== undefined ? Boolean(body.ascending) : true
      let query = supabase.from(table).select("*")
      if (orderBy) {
        // @ts-ignore - chain order only when provided
        query = query.order(orderBy, { ascending })
      }
      const { data, error } = await query
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "create_record") {
      const record = body?.record || {}
      const payload = applyDateColumns(table, record, true)
      const { data, error } = await supabase.from(table).insert(payload).select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "create_many") {
      const records: any[] = Array.isArray(body?.records) ? body.records : []
      if (records.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: "Không có dữ liệu để tạo." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const payload = records.map(r => applyDateColumns(table, r, true))
      const { data, error } = await supabase.from(table).insert(payload).select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "update_record") {
      const id: string = String(body?.id || "")
      const patch = body?.patch || {}
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const payload = applyDateColumns(table, patch, false)
      const { data, error } = await supabase.from(table).update(payload).eq("id", id).select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "delete_record") {
      const id: string = String(body?.id || "")
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { error } = await supabase.from(table).delete().eq("id", id)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "delete_many") {
      const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
      if (ids.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: "Danh sách id rỗng." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { error } = await supabase.from(table).delete().in("id", ids)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    return new Response(JSON.stringify({ ok: false, error: "Hành động không hợp lệ" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error("admin-crud error:", e)
    return new Response(JSON.stringify({ ok: false, error: "Lỗi hệ thống, vui lòng thử lại." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})