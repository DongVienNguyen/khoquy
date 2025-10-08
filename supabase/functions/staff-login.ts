// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

// Supabase client (service role)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Helpers
const nowIso = () => new Date().toISOString()

type Staff = {
  id: string
  created_date: string
  updated_date: string
  created_by: string | null
  username: string
  password: string
  staff_name: string
  email: string | null
  role: "admin" | "user"
  department: string | null
  account_status: "active" | "locked"
  failed_login_attempts: number
  last_failed_login: string | null
  locked_at: string | null
}

async function findStaff(username: string): Promise<Staff | null> {
  // Case-insensitive match
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .ilike("username", username)
    .limit(1)
  if (error) throw error
  return (data && data.length > 0 ? data[0] as Staff : null)
}

async function updateStaff(id: string, patch: Partial<Staff>): Promise<void> {
  const { error } = await supabase
    .from("staff")
    .update({ ...patch, updated_date: nowIso() })
    .eq("id", id)
  if (error) throw error
}

async function ensureAdmin(): Promise<{ created: boolean }> {
  const existing = await findStaff("admin")
  if (existing) {
    // Đảm bảo thông tin cơ bản đúng, không đổi mật khẩu nếu đã khác
    await updateStaff(existing.id, {
      role: "admin",
      department: existing.department ?? "NQ",
      account_status: "active",
      failed_login_attempts: 0,
      last_failed_login: null,
      locked_at: null,
    })
    return { created: false }
  }
  const admin: Omit<Staff, "id"> = {
    created_date: nowIso(),
    updated_date: nowIso(),
    created_by: "system@seed",
    username: "admin",
    password: "123456",
    staff_name: "Quản trị",
    email: "admin@vietcombank.com.vn",
    role: "admin",
    department: "NQ",
    account_status: "active",
    failed_login_attempts: 0,
    last_failed_login: null,
    locked_at: null,
  }
  const { error } = await supabase.from("staff").insert(admin)
  if (error) throw error
  return { created: true }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action as "check" | "login" | "ensure-admin"

    if (action === "ensure-admin") {
      const res = await ensureAdmin()
      return new Response(JSON.stringify({ ok: true, data: res }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 200,
      })
    }

    const usernameInput: string = String(body?.username ?? "").trim()
    if (!usernameInput) {
      return new Response(JSON.stringify({ ok: false, error: "Thiếu tên đăng nhập" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      })
    }

    const staff = await findStaff(usernameInput)
    if (!staff) {
      return new Response(JSON.stringify({ ok: false, error: "Tên đăng nhập hoặc mật khẩu không đúng" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 404,
      })
    }

    if (action === "check") {
      const locked = staff.account_status === "locked"
      return new Response(JSON.stringify({ ok: true, data: { locked, account_status: staff.account_status } }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 200,
      })
    }

    if (action === "login") {
      const passwordInput: string = String(body?.password ?? "")
      if (!passwordInput) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu mật khẩu" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400,
        })
      }

      if (staff.account_status === "locked") {
        return new Response(JSON.stringify({ ok: false, error: "Tài khoản của bạn đã bị khóa.", locked: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 423,
        })
      }

      const isMatch = passwordInput === staff.password // Demo: plaintext
      if (isMatch) {
        if (staff.failed_login_attempts > 0 || staff.last_failed_login) {
          await updateStaff(staff.id, {
            failed_login_attempts: 0,
            last_failed_login: null,
          })
        }
        const safeStaff = {
          id: staff.id,
          username: staff.username,
          staff_name: staff.staff_name,
          email: staff.email,
          role: staff.role,
          department: staff.department,
          account_status: staff.account_status,
        }
        return new Response(JSON.stringify({ ok: true, data: safeStaff }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 200,
        })
      } else {
        const newAttempts = (staff.failed_login_attempts ?? 0) + 1
        const patch: Partial<Staff> = {
          failed_login_attempts: newAttempts,
          last_failed_login: nowIso(),
        }
        let lockedNow = false
        if (newAttempts >= 3) {
          patch.account_status = "locked"
          patch.locked_at = nowIso()
          lockedNow = true
        }
        await updateStaff(staff.id, patch)

        const remaining = Math.max(0, 3 - newAttempts)
        const msg = lockedNow
          ? "Tài khoản đã bị khóa do nhập sai mật khẩu 3 lần."
          : `Mật khẩu không đúng. Còn ${remaining} lần thử trước khi bị khóa.`

        return new Response(JSON.stringify({ ok: false, error: msg, remainingAttempts: remaining, locked: lockedNow }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: lockedNow ? 423 : 401,
        })
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Hành động không hợp lệ" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 400,
    })
  } catch (e) {
    console.error("staff-login error:", e)
    return new Response(JSON.stringify({ ok: false, error: "Lỗi hệ thống, vui lòng thử lại." }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    })
  }
})