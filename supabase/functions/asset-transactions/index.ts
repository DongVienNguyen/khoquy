// @ts-nocheck
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

function nowIso() {
  return new Date().toISOString()
}

// Tính khoảng thời gian "hôm nay" theo GMT+7, trả về [startUtcISO, endUtcISO]
function gmt7DayRangeUtc(): [string, string] {
  const now = new Date()
  const gmt7Now = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const y = gmt7Now.getUTCFullYear()
  const m = gmt7Now.getUTCMonth()
  const d = gmt7Now.getUTCDate()
  const startGmt7 = new Date(Date.UTC(y, m, d, 0, 0, 0))
  const endGmt7 = new Date(Date.UTC(y, m, d, 24, 0, 0))
  const startUtc = new Date(startGmt7.getTime() - 7 * 60 * 60 * 1000)
  const endUtc = new Date(endGmt7.getTime() - 7 * 60 * 60 * 1000)
  return [startUtc.toISOString(), endUtc.toISOString()]
}

async function notifyAdminsAndUser(room: string, parts_day: string, transaction_date: string, count: number, codes: string[], submitterUsername: string, submitterName?: string) {
  // Lấy danh sách admin
  const { data: admins, error: staffErr } = await supabase
    .from("staff")
    .select("username, staff_name")
    .eq("role", "admin")
  if (staffErr) throw staffErr

  const titleForAdmin = `Thông báo mới từ ${submitterName || submitterUsername}`
  const msgForAdmin = `${submitterName || submitterUsername} đã gửi ${count} TS cho ${room} (${parts_day} - ${transaction_date}). Chi tiết: ${codes.slice(0, 5).join(", ")}${count > 5 ? `, ... (+${count - 5})` : ""}`

  const titleForUser = "Đã ghi nhận thông báo của bạn"
  const msgForUser = `Hệ thống đã lưu ${count} TS cho ${room} (${parts_day} - ${transaction_date}). Chi tiết: ${codes.slice(0, 5).join(", ")}${count > 5 ? `, ... (+${count - 5})` : ""}`

  // Tạo thông báo cho admin
  const adminNotifs = (admins || []).map((a) => ({
    title: titleForAdmin,
    message: msgForAdmin,
    recipient_username: a.username,
    notification_type: "asset_reminder",
    is_read: false,
    related_data: { room, parts_day, transaction_date, count, codes },
  }))
  if (adminNotifs.length > 0) {
    const { error: nErr } = await supabase.from("notifications").insert(adminNotifs)
    if (nErr) throw nErr
  }

  // Thông báo cho người gửi
  const { error: uErr } = await supabase.from("notifications").insert({
    title: titleForUser,
    message: msgForUser,
    recipient_username: submitterUsername,
    notification_type: "asset_reminder",
    is_read: false,
    related_data: { room, parts_day, transaction_date, count, codes },
  })
  if (uErr) throw uErr
}

async function upsertEmailUser(username: string, email: string | null, full_name: string | null, whenIso: string) {
  const payload = {
    username,
    email: email || null,
    full_name: full_name || username,
    last_notification_sent: whenIso,
    last_email_sent: whenIso,
    updated_date: nowIso(),
  }
  const { error } = await supabase.from("email_users").upsert(payload, { onConflict: "username" })
  if (error) throw error
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // Manual auth header presence check (verify_jwt=false)
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || "")

    if (action === "create") {
      const staff_username: string = String(body?.staff_username || "")
      const staff_email: string | null = body?.staff_email ? String(body.staff_email) : null
      const staff_name: string | null = body?.staff_name ? String(body.staff_name) : null
      const transactions: any[] = Array.isArray(body?.transactions) ? body.transactions : []

      if (!staff_username || transactions.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu dữ liệu người dùng hoặc danh sách giao dịch." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }

      const rows = transactions.map((t) => ({
        created_date: nowIso(),
        updated_date: nowIso(),
        created_by: staff_email || staff_username,
        transaction_date: t.transaction_date, // yyyy-MM-dd
        parts_day: t.parts_day,
        room: t.room,
        transaction_type: t.transaction_type,
        asset_year: t.asset_year,
        asset_code: t.asset_code,
        staff_code: staff_username,
        note: t.note ?? null,
        notified_at: t.notified_at, // UTC ISO
        is_deleted: false,
        change_logs: [],
      }))

      const { data: created, error: insErr } = await supabase.from("asset_transactions").insert(rows).select("*")
      if (insErr) throw insErr

      // Thông báo và cập nhật EmailUser
      const codes = (created || []).map((c) => `${c.asset_code}/${c.asset_year}`)
      if (created && created.length > 0) {
        const first = created[0]
        await notifyAdminsAndUser(first.room, first.parts_day, first.transaction_date, created.length, codes, staff_username, staff_name || undefined)
        await upsertEmailUser(staff_username, staff_email, staff_name, nowIso())
      }

      return new Response(JSON.stringify({ ok: true, data: created }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "list_mine_today") {
      const staff_username: string = String(body?.staff_username || "")
      if (!staff_username) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu username" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const [startIso, endIso] = gmt7DayRangeUtc()
      const { data, error } = await supabase
        .from("asset_transactions")
        .select("*")
        .eq("staff_code", staff_username)
        .eq("is_deleted", false)
        .gte("notified_at", startIso)
        .lt("notified_at", endIso)
        .order("created_date", { ascending: false })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "update_note") {
      const id: string = String(body?.id || "")
      const note: string = String(body?.note ?? "")
      const editor_username: string = String(body?.editor_username || "")
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data: rows, error: selErr } = await supabase.from("asset_transactions").select("*").eq("id", id).limit(1)
      if (selErr) throw selErr
      const current = rows && rows[0]
      const logs = Array.isArray(current?.change_logs) ? current.change_logs : []
      logs.push({
        time: nowIso(),
        field: "note",
        old_value: current?.note ?? null,
        new_value: note,
        edited_by: editor_username || null,
      })
      const { data, error } = await supabase
        .from("asset_transactions")
        .update({ note, updated_date: nowIso(), change_logs: logs })
        .eq("id", id)
        .select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (action === "soft_delete") {
      const id: string = String(body?.id || "")
      const deleted_by: string = String(body?.deleted_by || "")
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data: rows, error: selErr } = await supabase.from("asset_transactions").select("*").eq("id", id).limit(1)
      if (selErr) throw selErr
      const current = rows && rows[0]
      const logs = Array.isArray(current?.change_logs) ? current.change_logs : []
      logs.push({
        time: nowIso(),
        field: "delete",
        old_value: current?.is_deleted ?? false,
        new_value: true,
        edited_by: deleted_by || null,
      })
      const { data, error } = await supabase
        .from("asset_transactions")
        .update({ is_deleted: true, deleted_at: nowIso(), deleted_by, updated_date: nowIso(), change_logs: logs })
        .eq("id", id)
        .select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    return new Response(JSON.stringify({ ok: false, error: "Hành động không hợp lệ" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error("asset-transactions error:", e)
    return new Response(JSON.stringify({ ok: false, error: "Lỗi hệ thống, vui lòng thử lại." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})