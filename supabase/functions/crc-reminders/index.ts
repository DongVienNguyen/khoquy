import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, any>;

function ok(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...(init || {}),
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

async function sendEmailResend(toList: string[], subject: string, html: string, text?: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const payload = {
    from: "onboarding@resend.dev",
    to: toList,
    subject,
    html,
    ...(text ? { text } : {}),
  };
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(`Resend error: ${resp.status} ${msg}`);
  }
  return await resp.json().catch(() => ({}));
}

function renderDefaultHtml(reminder: any) {
  const safe = (s: any) => String(s ?? "").trim();
  const loai = safe(reminder.loai_bt_crc);
  const ngay = safe(reminder.ngay_thuc_hien);
  const ldp = safe(reminder.ldpcrc);
  const cb = safe(reminder.cbcrc);
  const quy = safe(reminder.quycrc);
  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; line-height: 1.6;">
    <h2 style="margin: 0 0 8px;">Nhắc duyệt CRC</h2>
    <p style="margin: 0 0 12px;">Chứng từ CRC cần được duyệt theo quy định.</p>
    <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
      <tbody>
        <tr><td style="padding: 6px 0; width: 160px; color: #64748b;">Loại BT CRC</td><td style="padding: 6px 0;"><strong>${loai}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">Ngày thực hiện</td><td style="padding: 6px 0;">${ngay}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">LĐPCRC</td><td style="padding: 6px 0;">${ldp || "-"}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">CBCRC</td><td style="padding: 6px 0;">${cb || "-"}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;">QUYCRC</td><td style="padding: 6px 0;">${quy || "-"}</td></tr>
      </tbody>
    </table>
    <p style="margin-top: 16px; font-size: 12px; color: #64748b;">Thời gian gửi: ${todayYmdGmt7()} (GMT+7)</p>
  </div>
  `;
}

function applyTemplate(template: string, reminder: any) {
  const replacements: Record<string, string> = {
    "{{loai_bt_crc}}": String(reminder.loai_bt_crc ?? ""),
    "{{ngay_thuc_hien}}": String(reminder.ngay_thuc_hien ?? ""),
    "{{ldpcrc}}": String(reminder.ldpcrc ?? ""),
    "{{cbcrc}}": String(reminder.cbcrc ?? ""),
    "{{quycrc}}": String(reminder.quycrc ?? ""),
  };
  let html = template || "";
  for (const [key, val] of Object.entries(replacements)) {
    html = html.split(key).join(val);
  }
  return html;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    // Staff suggestions
    if (action === "staff_suggestions") {
      const { data, error } = await admin.from("staff").select("staff_name, username, email").order("staff_name", { ascending: true });
      if (error) return err(error.message, 500);
      return ok(data || []);
    }

    // CRC role staff lists
    if (action === "list_ldpcrc_staff") {
      const { data, error } = await admin.from("ldpcrc_staff").select("id, ten_nv, email").order("ten_nv", { ascending: true });
      if (error) return err(error.message, 500);
      return ok(data || []);
    }
    if (action === "list_cbcrc_staff") {
      const { data, error } = await admin.from("cbcrc_staff").select("id, ten_nv, email").order("ten_nv", { ascending: true });
      if (error) return err(error.message, 500);
      return ok(data || []);
    }
    if (action === "list_quycrc_staff") {
      const { data, error } = await admin.from("quycrc_staff").select("id, ten_nv, email").order("ten_nv", { ascending: true });
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

    // Utilities
    function norm(s: string) {
      return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .trim();
    }
    async function emailForName(table: "ldpcrc_staff" | "cbcrc_staff" | "quycrc_staff", name?: string | null) {
      if (!name || !name.trim()) return null;
      const { data, error } = await admin.from(table).select("ten_nv, email").eq("ten_nv", name).limit(1);
      if (error) return null;
      const row = data?.[0] as { ten_nv?: string; email?: string } | undefined;
      if (!row?.email) return null;
      const e = String(row.email).trim();
      return e.includes("@") ? e : `${e}@vietcombank.com.vn`;
    }

    async function buildRecipients(reminder: any) {
      const list: string[] = [];
      const e1 = await emailForName("ldpcrc_staff", reminder.ldpcrc);
      const e2 = await emailForName("cbcrc_staff", reminder.cbcrc);
      const e3 = await emailForName("quycrc_staff", reminder.quycrc);
      [e1, e2, e3].forEach((e) => { if (e) list.push(e); });
      return Array.from(new Set(list));
    }

    async function sendOne(reminder: any, template?: string) {
      const recipients = await buildRecipients(reminder);
      if (recipients.length === 0) {
        throw new Error("Không tìm thấy email người nhận từ LĐPCRC/CBCRC/QUYCRC");
      }

      const subject = `Nhắc duyệt CRC: ${String(reminder.loai_bt_crc ?? "")}`;
      const html = template ? applyTemplate(template, reminder) : renderDefaultHtml(reminder);

      await sendEmailResend(recipients, subject, html);

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

      const { error: delErr } = await admin.from("crc_reminders").delete().eq("id", reminder.id);
      if (delErr) throw delErr;
    }

    if (action === "send_one") {
      const id = String(body.id || "");
      const template: string | undefined = body?.template;
      if (!id) return err("id is required");
      const { data: r, error } = await admin.from("crc_reminders").select("*").eq("id", id).single();
      if (error || !r) return err(error?.message || "Not found", 404);
      await sendOne(r, template);
      return ok({ success: true });
    }

    if (action === "send_batch_today") {
      const template: string | undefined = body?.template;
      const ddmm = todayDdMmGmt7();
      const { data: rows, error } = await admin.from("crc_reminders").select("*").eq("ngay_thuc_hien", ddmm);
      if (error) return err(error.message, 500);
      let success = 0;
      for (const r of rows || []) {
        try { await sendOne(r, template); success++; } catch (_e) { /* continue next */ }
      }
      return ok({ success: true, count: success });
    }

    if (action === "send_batch_all") {
      const template: string | undefined = body?.template;
      const { data: rows, error } = await admin.from("crc_reminders").select("*");
      if (error) return err(error.message, 500);
      let success = 0;
      for (const r of rows || []) {
        try { await sendOne(r, template); success++; } catch (_e) { /* continue next */ }
      }
      return ok({ success: true, count: success });
    }

    return err("Unknown action", 404);
  } catch (e) {
    console.error("crc-reminders error:", e);
    const msg = e instanceof Error ? e.message : "Internal error";
    return err(`Lỗi gửi email: ${msg}`, 500);
  }
});