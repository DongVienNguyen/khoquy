"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";

type SafeStaff = {
  id: string;
  username: string;
  staff_name: string;
  email: string | null;
  role: "admin" | "user";
  department: string | null;
  account_status: "active" | "locked";
};

type Props = {
  staff?: SafeStaff;
  username?: string;
};

const FUNCTION_URL = `${SUPABASE_PUBLIC_URL}/functions/v1/staff-login`;

// Helper gọi edge function staff-login, ưu tiên supabase.functions.invoke, fallback fetch
async function callStaffLogin(body: Record<string, any>): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("staff-login", { body });
    if (!error) {
      return { ok: true, data };
    }
  } catch {
    // silent, fallback phía dưới
  }

  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLIC_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      return { ok: true, data: json };
    }
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to fetch" };
  }
}

const LinkSignIn: React.FC<Props> = ({ staff, username }) => {
  const router = useRouter();

  React.useEffect(() => {
    const uname = typeof username === "string" ? username.trim() : "";

    const persistStaff = (s: SafeStaff) => {
      try {
        window.localStorage.setItem("loggedInStaff", JSON.stringify(s));

        // Cookie cho middleware / chuyển hướng sau này (giống sign-in)
        const cookieBase = ["path=/", "SameSite=Lax", "Max-Age=315360000"]; // ~10 năm
        if (typeof window !== "undefined" && window.location.protocol === "https:") {
          cookieBase.push("Secure");
        }
        document.cookie = [`staffRole=${encodeURIComponent(s.role)}`, ...cookieBase].join("; ");
        document.cookie = [`staffDept=${encodeURIComponent(s.department || "")}`, ...cookieBase].join("; ");

        // Cookie linkUser cũ vẫn giữ để không phá logic khác
        const linkCookie = [
          `linkUser=${encodeURIComponent(s.username)}`,
          "path=/",
          "SameSite=Lax",
          "Max-Age=2592000", // 30 ngày
        ];
        if (typeof window !== "undefined" && window.location.protocol === "https:") {
          linkCookie.push("Secure");
        }
        document.cookie = linkCookie.join("; ");
      } catch {}
    };

    // Luồng mới: nếu có username trong URL, dùng edge function để lấy đúng staff + department
    if (uname) {
      (async () => {
        const result = await callStaffLogin({ action: "link-lookup", username: uname });
        if (result.ok && result.data?.ok && result.data.data) {
          const s: SafeStaff = result.data.data;
          persistStaff(s);
          const target = s.department === "NQ" ? "/daily-report" : "/asset-entry";
          router.replace(target);
        } else {
          // Nếu link không hợp lệ hoặc user bị khóa → quay về sign-in
          router.replace("/sign-in");
        }
      })();
      return;
    }

    // Backward-compat: nếu có staff từ luồng cũ, vẫn hoạt động như bình thường
    if (staff && typeof staff.username === "string" && staff.username.trim()) {
      persistStaff(staff);
      const target = staff.department === "NQ" ? "/daily-report" : "/asset-entry";
      router.replace(target);
      return;
    }

    // Trường hợp không có username hợp lệ
    router.replace("/sign-in");
  }, [router, staff, username]);

  return null;
};

export default LinkSignIn;