/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cleanup-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CleanupResult = {
  removed_count: number;
  checked_count: number;
  ttl_hours: number;
  warnings?: string[];
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CLEANUP_TOKEN } = Deno.env.toObject();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured: Supabase env missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Require Authorization bearer == anon key and a cleanup token header
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!bearer || SUPABASE_ANON_KEY !== bearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const tokenHeader = req.headers.get("x-cleanup-token") || "";
  if (!CLEANUP_TOKEN || tokenHeader !== CLEANUP_TOKEN) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let ttlHours = 72;
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("ttlHours");
    if (q) {
      const n = parseInt(q, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 168) ttlHours = n;
    }
  } catch {}

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) as any;
  const bucket = "ocr-staging";
  const prefix = "debug";

  // Ensure bucket existence
  try {
    const { data } = await supabase.storage.getBucket(bucket);
    if (!data) {
      await supabase.storage.createBucket(bucket, { public: false });
    }
  } catch {}

  const now = Date.now();
  const cutoff = now - ttlHours * 3600 * 1000;

  let removed = 0;
  let checked = 0;
  const warnings: string[] = [];

  // List files with pagination
  let page = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit, offset: page * limit });
    if (error) {
      warnings.push(`List error: ${error.message || "unknown"}`);
      break;
    }
    if (!data || !data.length) break;

    for (const item of data) {
      checked++;
      const name = item.name;
      // We only operate on files (not subdirectories)
      const path = `${prefix}/${name}`;
      const updatedAt = item.updated_at ? Date.parse(item.updated_at) : now;
      const createdAt = item.created_at ? Date.parse(item.created_at) : updatedAt;
      const ts = Number.isFinite(createdAt) ? createdAt : updatedAt;
      if (ts < cutoff) {
        const { error: delErr } = await supabase.storage.from(bucket).remove([path]);
        if (!delErr) removed++;
      }
    }

    if (data.length < limit) break;
    page++;
  }

  const result: CleanupResult = { removed_count: removed, checked_count: checked, ttl_hours: ttlHours, warnings: warnings.length ? warnings : undefined };
  return new Response(JSON.stringify({ data: result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});