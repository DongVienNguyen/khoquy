import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function todayDdMmGmt7(): string {
  const now = new Date();
  const g7 = new Date(now.getTime() + 7 * 3600 * 1000);
  const dd = String(g7.getUTCDate()).padStart(2, "0");
  const mm = String(g7.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}`;
}
function nowIso() { return new Date().toISOString(); }
function todayYmdGmt7(): string {
  const now = new Date();
  const g7 = new Date(now.getTime() + 7 * 3600 * 1000);
  const y = g7.getUTCFullYear();
  const m = String(g7.getUTCMonth() + 1).padStart(2, "0");
  const d = String(g7.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({} as Json));
  const action = String(body?.action || "");

  // Listings
  if (action === "list_waiting") {
    const { data, error } = await admin.from("crc_reminders").select("*").eq("is_sent", false).order("created_date", { ascending: false });
    if (error) return err(error.message, 500);
    return ok(data);
  }
  if (action === "list_sent") {
    const { data, error } = await admin.from("sent_crc_reminders").select("*").order("sent_date", { ascending: false }).order("created_date", { ascending: false });
    if (error) return err(error.message, 500);
    return ok(data);
  }

  // Staff suggestions: return staff_name, username, email (if present)
  if (action === "staff_suggestions") {
    const { data, error } = await admin.from("staff").select("staff_name, username, email").order("staff_name", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data || []);
  }

  // New: list staff from specific CRC role tables
  if (action === "list_ldpcrc_staff") {
    const { data, error } = await admin
      .from("ldpcrc_staff")
      .select("id, ten_nv, email")
      .order("ten_nv", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data || []);
  }

  if (action === "list_cbcrc_staff") {
    const { data, error } = await admin
      .from("cbcrc_staff")
      .select("id, ten_nv, email")
      .order("ten_nv", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data || []);
  }

  if (action === "list_quycrc_staff") {
    const { data, error } = await admin
      .from("quycrc_staff")
      .select("id, ten_nv, email")
      .order("ten_nv", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data || []);
  }

  // Create / update / delete
  if (action === "create_reminder") {
    const r = body.reminder as Json | undefined;
    if (!r || !r.loai_bt_crc || !r.ngay_thuc_hien) return err("Missing loai_bt_crc/ngay_thuc_hien");
    const now = nowIso();
    const ins = {
      created_date: now,
      updated_date: now,
      created_by: r.created_by || null,
      loai_bt_crc: r.loai_bt_crc,
      ngay_thuc_hien: r.ngay_thuc_hien,
      so_chung_tu: r.so_chung_tu || null,
      ten_ts: r.ten_ts || null,
      ldpcrc: r.ldpcrc || null,
      cbcrc: r.cbcrc || null,
      quycrc: r.quycrc || null,
      is_sent: false,
    };
    const { data, error } = await admin.from("crc_reminders").insert(ins).select("*").single();
    if (error) return err(error.message, 500);
    return ok(data);
  }

  if (action === "update_reminder") {
    const id = String(body.id || "");
    const patch = (body.patch || {}) as Json;
    if (!id) return err("id is required");
    const upd = {
      ...(patch.loai_bt_crc !== undefined ? { loai_bt_crc: patch.loai_bt_crc } : {}),
      ...(patch.ngay_thuc_hien !== undefined ? { ngay_thuc_hien: patch.ngay_thuc_hien } : {}),
      ...(patch.so_chung_tu !== undefined ? { so_chung_tu: patch.so_chung_tu } : {}),
      ...(patch.ten_ts !== undefined ? { ten_ts: patch.ten_ts } : {}),
      ...(patch.ldpcrc !== undefined ? { ldpcrc: patch.ldpcrc } : {}),
      ...(patch.cbcrc !== undefined ? { cbcrc: patch.cbcrc } : {}),
      ...(patch.quycrc !== undefined ? { quycrc: patch.quycrc } : {}),
      updated_date: nowIso(),
    };
    const { data, error } = await admin.from("crc_reminders").update(upd).eq("id", id).select("*").single();
    if (error) return err(error.message, 500);
    return ok(data);
  }

  if (action === "delete_reminder") {
    const id = String(body.id || "");
    if (!id) return err("id is required");
    const { error } = await admin.from("crc_reminders").delete().eq("id", id);
    if (error) return err(error.message, 500);
    return ok({ success: true });
  }

  if (action === "delete_sent") {
    const id = String(body.id || "");
    if (!id) return err("id is required");
    const { error } = await admin.from("sent_crc_reminders").delete().eq("id", id);
    if (error) return err(error.message, 500);
    return ok({ success: true });
  }

  // Helper: map name -> username via staff table (first match by staff_name)
  async function findUsernameByName(name?: string | null): Promise<string | null> {
    if (!name || !name.trim()) return null;
    const { data, error } = await admin.from("staff").select("username, staff_name").eq("staff_name", name).limit(1);
    if (error) return null;
    const row = data?.[0];
    return row?.username || null;
  }

  async function sendOne(reminder: any) {
    // Insert notification(s)
    const notifMessage = `Chứng từ CRC: ${reminder.loai_bt_crc} ngày ${reminder.ngay_thuc_hien} cần được duyệt đúng theo quy định.`;
    const recipients: (string | null)[] = [
      await findUsernameByName(reminder.ldpcrc),
      await findUsernameByName(reminder.cbcrc),
      await findUsernameByName(reminder.quycrc),
    ].filter(Boolean) as string[];
    if (recipients.length > 0) {
      const notifs = recipients.map((u) => ({
        title: `Nhắc nhở duyệt CRC: ${reminder.loai_bt_crc}`,
        message: notifMessage,
        recipient_username: u,
        notification_type: "crc_reminder",
        is_read: false,
        related_data: { crc_type: reminder.loai_bt_crc, execution_date: reminder.ngay_thuc_hien },
      }));
      const { error: nErr } = await admin.from("notifications").insert(notifs);
      if (nErr) console.warn("notif insert error:", nErr.message);
    }

    // Move to sent table
    const sent = {
      created_date: nowIso(),
      updated_date: nowIso(),
      created_by: reminder.created_by || null,
      loai_bt_crc: reminder.loai_bt_crc,
      ngay_thuc_hien: reminder.ngay_thuc_hien,
      so_chung_tu: reminder.so_chung_tu || null,
      ten_ts: reminder.ten_ts || null,
      ldpcrc: reminder.ldpcrc || null,
      cbcrc: reminder.cbcrc || null,
      quycrc: reminder.quycrc || null,
      sent_date: todayYmdGmt7(),
    };
    const { error: insErr } = await admin.from("sent_crc_reminders").insert(sent);
    if (insErr) throw insErr;

    // Delete original
    const { error: delErr } = await admin.from("crc_reminders").delete().eq("id", reminder.id);
    if (delErr) throw delErr;
  }

  if (action === "send_one") {
    const id = String(body.id || "");
    if (!id) return err("id is required");
    const { data: r, error } = await admin.from("crc_reminders").select("*").eq("id", id).single();
    if (error || !r) return err(error?.message || "Not found", 404);
    await sendOne(r);
    return ok({ success: true });
  }

  if (action === "send_batch_today") {
    const ddmm = todayDdMmGmt7();
    const { data: rows, error } = await admin.from("crc_reminders").select("*").eq("ngay_thuc_hien", ddmm);
    if (error) return err(error.message, 500);
    for (const r of rows || []) { await sendOne(r); }
    return ok({ success: true, count: (rows || []).length });
  }

  if (action === "send_batch_all") {
    const { data: rows, error } = await admin.from("crc_reminders").select("*");
    if (error) return err(error.message, 500);
    for (const r of rows || []) { await sendOne(r); }
    return ok({ success: true, count: (rows || []).length });
  }

  return err("Unknown action", 404);
});