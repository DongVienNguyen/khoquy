/* eslint-disable */
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

// GMT+7 helpers
function gmt7DayRangeUtcFor(ymd: string): [string, string] {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10))
  const startGmt7 = new Date(Date.UTC(y, (m - 1), d, 0, 0, 0))
  const endGmt7 = new Date(Date.UTC(y, (m - 1), d, 24, 0, 0))
  const startUtc = new Date(startGmt7.getTime() - 7 * 60 * 60 * 1000)
  const endUtc = new Date(endGmt7.getTime() - 7 * 60 * 60 * 1000)
  return [startUtc.toISOString(), endUtc.toISOString()]
}

function gmt7WeekRangeUtc(date: Date): [string, string] {
  const gmt7 = new Date(date.getTime() + 7 * 3600 * 1000)
  const dow = gmt7.getUTCDay()
  const diffToMonday = (dow + 6) % 7
  const mondayGmt7 = new Date(Date.UTC(gmt7.getUTCFullYear(), gmt7.getUTCMonth(), gmt7.getUTCDate() - diffToMonday, 0, 0, 0))
  const sundayGmt7 = new Date(Date.UTC(gmt7.getUTCFullYear(), gmt7.getUTCMonth(), gmt7.getUTCDate() + (6 - diffToMonday), 24, 0, 0))
  const startUtc = new Date(mondayGmt7.getTime() - 7 * 3600 * 1000)
  const endUtc = new Date(sundayGmt7.getTime() - 7 * 3600 * 1000)
  return [startUtc.toISOString(), endUtc.toISOString()]
}

async function notifyAdminsAndUser(room: string, parts_day: string, transaction_date: string, count: number, codes: string[], submitterUsername: string, submitterName?: string) {
  const { data: admins, error: staffErr } = await supabase
    .from("staff")
    .select("username, staff_name")
    .eq("role", "admin")
  if (staffErr) throw staffErr

  const titleForAdmin = `Thông báo mới từ ${submitterName || submitterUsername}`
  const msgForAdmin = `${submitterName || submitterUsername} đã gửi ${count} TS cho ${room} (${parts_day} - ${transaction_date}). Chi tiết: ${codes.slice(0, 5).join(", ")}${count > 5 ? `, ... (+${count - 5})` : ""}`
  const titleForUser = "Đã ghi nhận thông báo của bạn"
  const msgForUser = `Hệ thống đã lưu ${count} TS cho ${room} (${parts_day} - ${transaction_date}). Chi tiết: ${codes.slice(0, 5).join(", ")}${count > 5 ? `, ... (+${count - 5})` : ""}`

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
  const { data: existing, error: selErr } = await supabase
    .from("email_users")
    .select("id")
    .eq("username", username)
    .limit(1)
  if (selErr) throw selErr

  if (existing && existing.length > 0) {
    const targetId = existing[0].id
    const { error: updErr } = await supabase
      .from("email_users")
      .update(payload)
      .eq("id", targetId)
    if (updErr) throw updErr
  } else {
    const { error: insErr } = await supabase
      .from("email_users")
      .insert({ ...payload, created_date: nowIso() })
    if (insErr) throw insErr
  }
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
    const action = String(body?.action || "")

    // CREATE transactions (from AssetEntry) với idempotency_key
    if (action === "create") {
      const staff_username: string = String(body?.staff_username || "")
      const staff_email: string | null = body?.staff_email ? String(body.staff_email) : null
      const staff_name: string | null = body?.staff_name ? String(body.staff_name) : null
      const idempotency_key: string | null = body?.idempotency_key ? String(body.idempotency_key) : null
      const transactions: any[] = Array.isArray(body?.transactions) ? body.transactions : []
      if (!staff_username || transactions.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu dữ liệu người dùng hoặc danh sách giao dịch." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }

      // Nếu có idempotency_key và đã tồn tại => trả về các bản ghi tương ứng trong ngày
      if (idempotency_key) {
        const { data: idemExisting, error: idemErr } = await supabase
          .from("idempotency_keys")
          .select("key, saved_at")
          .eq("key", idempotency_key)
          .limit(1)
        if (idemErr) throw idemErr

        if (idemExisting && idemExisting.length > 0) {
          // Tìm các bản ghi đã tạo trùng logic
          const first = transactions[0]
          const txDate = String(first.transaction_date)
          const room = String(first.room)
          const parts_day = String(first.parts_day)
          const codesSet = new Set((transactions || []).map((t: any) => `${t.asset_code}.${t.asset_year}`))

          const { data: maybeRows, error: selTxErr } = await supabase
            .from("asset_transactions")
            .select("*")
            .eq("staff_code", staff_username)
            .eq("transaction_date", txDate)
            .eq("room", room)
            .eq("parts_day", parts_day)
            .eq("is_deleted", false)
            .order("created_date", { ascending: false })
          if (selTxErr) throw selTxErr

          const filtered = (maybeRows || []).filter((t: any) => codesSet.has(`${t.asset_code}.${t.asset_year}`))
          return new Response(JSON.stringify({ ok: true, data: filtered }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
        }
      }

      const notifiedAt = nowIso()
      const rows = transactions.map((t) => ({
        created_date: notifiedAt,
        updated_date: notifiedAt,
        created_by: staff_email || staff_username,
        transaction_date: t.transaction_date,
        parts_day: t.parts_day,
        room: t.room,
        transaction_type: t.transaction_type,
        asset_year: t.asset_year,
        asset_code: t.asset_code,
        staff_code: staff_username,
        note: t.note ?? null,
        notified_at: notifiedAt, // server set
        is_deleted: false,
        change_logs: [],
      }))

      const { data: created, error: insErr } = await supabase.from("asset_transactions").insert(rows).select("*")
      if (insErr) throw insErr

      // Ghi idempotency_key nếu có
      if (idempotency_key) {
        const { error: idemInsErr } = await supabase.from("idempotency_keys").insert({
          key: idempotency_key,
          saved_at: notifiedAt,
        })
        // nếu lỗi (trùng), bỏ qua để không ảnh hưởng kết quả chính
        if (idemInsErr) {
          console.log("idempotency insert err:", idemInsErr)
        }
      }

      // Side-effects: thông báo + cập nhật email_users
      try {
        const codes = (created || []).map((c) => `${c.asset_code}.${c.asset_year}`)
        if (created && created.length > 0) {
          const first = created[0]
          await notifyAdminsAndUser(
            first.room,
            first.parts_day,
            first.transaction_date,
            created.length,
            codes,
            staff_username,
            staff_name || undefined
          )
          await upsertEmailUser(staff_username, staff_email, staff_name, notifiedAt)
        }
      } catch (sideErr) {
        console.error("Side-effects failed (notifications/email_users):", sideErr)
      }

      return new Response(JSON.stringify({ ok: true, data: created }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // LIST mine today (for AssetEntry)
    if (action === "list_mine_today") {
      const staff_username: string = String(body?.staff_username || "")
      if (!staff_username) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu username" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const today = new Date()
      const [startIso, endIso] = gmt7WeekRangeUtc(today)
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

    // UPDATE note (AssetEntry)
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
      logs.push({ time: nowIso(), field: "note", old_value: current?.note ?? null, new_value: note, edited_by: editor_username || null })
      const { data, error } = await supabase
        .from("asset_transactions")
        .update({ note, updated_date: nowIso(), change_logs: logs })
        .eq("id", id)
        .select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // SOFT delete (AssetEntry)
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
      logs.push({ time: nowIso(), field: "delete", old_value: current?.is_deleted ?? false, new_value: true, edited_by: deleted_by || null })
      const { data, error } = await supabase
        .from("asset_transactions")
        .update({ is_deleted: true, deleted_at: nowIso(), deleted_by, updated_date: nowIso(), change_logs: logs })
        .eq("id", id)
        .select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // LIST by date range (DailyReport)
    if (action === "list_range") {
      const start: string = String(body?.start || "")
      const end: string = String(body?.end || "")
      const parts_day: string | null = body?.parts_day ? String(body.parts_day) : null
      const include_deleted: boolean = !!body?.include_deleted
      if (!start || !end) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu khoảng ngày" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data, error } = await supabase
        .from("asset_transactions")
        .select("*")
        .gte("transaction_date", start)
        .lte("transaction_date", end)
        .order("room", { ascending: true })
        .order("asset_year", { ascending: true })
        .order("asset_code", { ascending: true })
      if (error) throw error
      const filtered = (data || []).filter((t: any) => (include_deleted ? true : !t.is_deleted)).filter((t: any) => (parts_day ? t.parts_day === parts_day : true))
      return new Response(JSON.stringify({ ok: true, data: filtered }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // NOTES
    if (action === "list_notes") {
      const { data, error } = await supabase.from("processed_notes").select("*").eq("is_done", false).order("created_date", { ascending: false })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    if (action === "create_note") {
      const note = body?.note || {}
      const { data, error } = await supabase.from("processed_notes").insert({
        created_date: nowIso(),
        updated_date: nowIso(),
        created_by: note.created_by || null,
        room: note.room,
        operation_type: note.operation_type,
        content: note.content,
        staff_code: note.staff_code,
        is_done: false,
        mail_to_nv: note.mail_to_nv || null,
      }).select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    if (action === "update_note_full") {
      const id: string = String(body?.id || "")
      const patch = body?.patch || {}
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data, error } = await supabase.from("processed_notes").update({ ...patch, updated_date: nowIso() }).eq("id", id).select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    if (action === "delete_note") {
      const id: string = String(body?.id || "")
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { error } = await supabase.from("processed_notes").delete().eq("id", id)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    if (action === "mark_note_done") {
      const id: string = String(body?.id || "")
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data, error } = await supabase.from("processed_notes").update({ is_done: true, done_at: nowIso(), updated_date: nowIso() }).eq("id", id).select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // TAKEN STATUS
    if (action === "list_taken_status") {
      const user_username: string = String(body?.user_username || "")
      const week_year: string = String(body?.week_year || "")
      if (!user_username || !week_year) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu user/tuần" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data, error } = await supabase.from("taken_asset_status").select("*").eq("user_username", user_username).eq("week_year", week_year)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    if (action === "toggle_taken_status") {
      const transaction_id: string = String(body?.transaction_id || "")
      const user_username: string = String(body?.user_username || "")
      const week_year: string = String(body?.week_year || "")
      if (!transaction_id || !user_username || !week_year) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu dữ liệu toggle" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data: existing, error: selErr } = await supabase
        .from("taken_asset_status")
        .select("*")
        .eq("transaction_id", transaction_id)
        .eq("user_username", user_username)
        .eq("week_year", week_year)
      if (selErr) throw selErr

      if (existing && existing.length > 0) {
        const ids = existing.map((x: any) => x.id)
        const { error: delErr } = await supabase.from("taken_asset_status").delete().in("id", ids)
        if (delErr) throw delErr
        return new Response(JSON.stringify({ ok: true, data: { taken: false } }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      } else {
        const { error: insErr } = await supabase.from("taken_asset_status").insert({
          created_date: nowIso(),
          updated_date: nowIso(),
          created_by: user_username,
          transaction_id,
          user_username,
          week_year,
          marked_at: nowIso(),
        })
        if (insErr) throw insErr
        return new Response(JSON.stringify({ ok: true, data: { taken: true } }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    }

    // UPDATE transaction
    if (action === "update_transaction") {
      const id: string = String(body?.id || "")
      const patch: any = body?.patch || {}
      const editor_username: string = String(body?.editor_username || "")
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { data: rows, error: selErr } = await supabase.from("asset_transactions").select("*").eq("id", id).limit(1)
      if (selErr) throw selErr
      const current = rows && rows[0]
      const fields = ["transaction_date", "parts_day", "room", "transaction_type", "asset_year", "asset_code", "note"]
      const diffs: any[] = []
      fields.forEach((f) => {
        const oldVal = current?.[f] === null || current?.[f] === undefined ? "" : String(current?.[f])
        const newVal = patch?.[f] === null || patch?.[f] === undefined ? "" : String(patch?.[f])
        if (oldVal !== newVal) {
          diffs.push({ field: f, old_value: oldVal, new_value: newVal })
        }
      })
      const logs = Array.isArray(current?.change_logs) ? current.change_logs : []
      const now = nowIso()
      diffs.forEach((d) => logs.push({ time: now, field: d.field, old_value: d.old_value, new_value: d.new_value, edited_by: editor_username || null }))
      const { data, error } = await supabase
        .from("asset_transactions")
        .update({ ...patch, updated_date: now, change_logs: logs })
        .eq("id", id)
        .select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, data: data && data[0] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // HARD delete
    if (action === "hard_delete_transaction") {
      const id: string = String(body?.id || "")
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      const { error } = await supabase.from("asset_transactions").delete().eq("id", id)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    return new Response(JSON.stringify({ ok: false, error: "Hành động không hợp lệ" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error("asset-transactions error:", e)
    return new Response(JSON.stringify({ ok: false, error: "Lỗi hệ thống, vui lòng thử lại." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})