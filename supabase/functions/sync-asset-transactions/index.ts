import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeText(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function toDateStrGMT7(d: Date): string {
  // Lấy ngày hiện tại theo GMT+7 ở dạng YYYY-MM-DD
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function makeNaturalKey(rec: {
  transaction_date: string;
  parts_day: string;
  room: string;
  transaction_type: string;
  asset_year: number | null;
  asset_code: number | null;
  staff_code: string;
}): string {
  return [
    String(rec.transaction_date).slice(0, 10),
    normalizeText(rec.parts_day),
    normalizeText(rec.room),
    normalizeText(rec.transaction_type),
    Number(rec.asset_year ?? 0),
    Number(rec.asset_code ?? 0),
    normalizeText(rec.staff_code),
  ].join("|");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BASE44_API_KEY = Deno.env.get("BASE44_API_KEY") || "";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const todayStr =
    (body && typeof body.date === "string" && body.date.match(/^\d{4}-\d{2}-\d{2}$/))
      ? body.date
      : toDateStrGMT7(new Date());

  const t0 = Date.now();

  try {
    // Gọi API ngoài
    const url = "https://app.base44.com/api/apps/684d56312caf55a7b8e58907/entities/AssetTransaction";
    const resp = await fetch(url, {
      headers: {
        api_key: BASE44_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`External API error: ${resp.status} ${txt}`);
    }
    const json = await resp.json().catch(() => null);

    const list: any[] = Array.isArray(json)
      ? json
      : (json && Array.isArray(json?.data) ? json.data : []);

    // Tính mốc ngày hôm nay/hôm qua theo GMT+7
    const todayStart = new Date(`${todayStr}T00:00:00+07:00`);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const yesterdayStr = toDateStrGMT7(yesterdayStart);

    // Lọc theo notified_at: chỉ giữ hôm nay và hôm qua (GMT+7)
    const filteredItems = list.filter((it) => {
      const na = it?.notified_at;
      if (!na) return false;
      const dayStr = toDateStrGMT7(new Date(na));
      return dayStr === todayStr || dayStr === yesterdayStr;
    });

    // Tải dữ liệu DB theo khoảng notified_at: từ hôm qua 00:00 đến ngày mai 00:00 (GMT+7)
    const { data: existingRows, error: selectErr } = await supabase
      .from("asset_transactions")
      .select("*")
      .gte("notified_at", yesterdayStart.toISOString())
      .lt("notified_at", tomorrowStart.toISOString());

    if (selectErr) throw selectErr;

    const existingMap = new Map<string, any>();
    (existingRows || []).forEach((row: any) => {
      const key = [
        String(row.transaction_date).slice(0, 10),
        normalizeText(row.parts_day),
        normalizeText(row.room),
        normalizeText(row.transaction_type),
        Number(row.asset_year ?? 0),
        Number(row.asset_code ?? 0),
        normalizeText(row.staff_code),
      ].join("|");
      existingMap.set(key, row);
    });

    const nowIso = new Date().toISOString();
    const inserts: any[] = [];
    const updates: { id: string; patch: any }[] = [];

    for (const it of filteredItems) {
      const record = {
        transaction_date: String(it.transaction_date).slice(0, 10),
        parts_day: String(it.parts_day ?? "").trim(),
        room: String(it.room ?? "").trim(),
        transaction_type: String(it.transaction_type ?? "").trim(),
        asset_year:
          it.asset_year === null || it.asset_year === undefined
            ? null
            : Number(it.asset_year),
        asset_code:
          it.asset_code === null || it.asset_code === undefined
            ? null
            : Number(it.asset_code),
        staff_code: String(it.staff_code ?? "").trim(),
        note: it.note === null || it.note === undefined ? null : String(it.note),
        notified_at:
          it.notified_at ? new Date(it.notified_at).toISOString() : null,
        is_deleted: !!it.is_deleted,
        deleted_at:
          it.deleted_at ? new Date(it.deleted_at).toISOString() : null,
        deleted_by:
          it.deleted_by === null || it.deleted_by === undefined
            ? null
            : String(it.deleted_by),
        change_logs: (() => {
          const cl = it.change_logs;
          if (cl === null || cl === undefined || cl === "") return [];
          if (typeof cl === "string") {
            try {
              return JSON.parse(cl);
            } catch {
              return { raw: cl };
            }
          }
          return cl;
        })(),
        updated_date: nowIso,
        created_by: it.created_by ? String(it.created_by) : "sync",
      };

      const key = makeNaturalKey(record);
      const existing = existingMap.get(key);

      if (!existing) {
        inserts.push({
          ...record,
          created_date: nowIso,
        });
      } else {
        // So sánh các trường để quyết định update
        let changed = false;
        const fields = [
          "parts_day",
          "room",
          "transaction_type",
          "asset_year",
          "asset_code",
          "staff_code",
          "note",
          "notified_at",
          "is_deleted",
          "deleted_at",
          "deleted_by",
          "change_logs",
        ] as const;

        for (const f of fields) {
          const a = (record as any)[f];
          const b = existing[f];
          if (f === "asset_year" || f === "asset_code") {
            const aa = a === null || a === undefined ? null : Number(a);
            const bb = b === null || b === undefined ? null : Number(b);
            if (aa !== bb) {
              changed = true;
              break;
            }
          } else if (f === "change_logs") {
            const sa = JSON.stringify(a ?? null);
            const sb = JSON.stringify(existing.change_logs ?? null);
            if (sa !== sb) {
              changed = true;
              break;
            }
          } else {
            if (String(a ?? "") !== String(b ?? "")) {
              changed = true;
              break;
            }
          }
        }

        if (changed) {
          updates.push({ id: existing.id, patch: record });
        }
      }
    }

    // Ghi DB: batch insert/update
    let insCount = 0;
    let updCount = 0;

    if (inserts.length) {
      for (let i = 0; i < inserts.length; i += 100) {
        const chunk = inserts.slice(i, i + 100);
        const { error } = await supabase.from("asset_transactions").insert(chunk);
        if (error) throw error;
        insCount += chunk.length;
      }
    }

    if (updates.length) {
      for (const u of updates) {
        const { error } = await supabase
          .from("asset_transactions")
          .update(u.patch)
          .eq("id", u.id);
        if (error) throw error;
        updCount += 1;
      }
    }

    const resBody = {
      date: todayStr,
      fetched: list.length || 0,
      filteredToday: filteredItems.length, // hiện đại diện cho 2 ngày (hôm nay + hôm qua)
      inserted: insCount,
      updated: updCount,
      skipped: filteredItems.length - insCount - updCount,
      durationMs: Date.now() - t0,
      status: "ok",
    };

    return new Response(JSON.stringify({ data: resBody }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    const msg = (e as any)?.message || "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});