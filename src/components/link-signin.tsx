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

async function callStaffLogin(body: Record<string, any>) {
  // 1) Thử invoke qua supabase client
  try {
    const { data, error } = await supabase.functions.invoke("staff-login", { body });
    if (!error) {
      return { ok: true, data };
    }
  } catch {
    // bỏ qua để fallback
  }

  // 2) Fallback: gọi trực tiếp qua fetch
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

    // Trường hợp có username trong URL: dùng edge function link-lookup để lấy staff chính xác (kèm department)
    if (uname) {
      (async () => {
        const result = await callStaffLogin({ action: "link-lookup", username: uname });
        const payload: any = result.ok ? result.data : null;

        if (!payload?.ok || !payload.data) {
          // Không tìm được user / link không hợp lệ → quay về trang đăng nhập
          router.replace("/sign-in");
          return;
        }

        const safeStaff: SafeStaff = payload.data;

        try {
          // Lưu staff đầy đủ (có department) vào localStorage
          window.localStorage.setItem("loggedInStaff", JSON.stringify(safeStaff));

          // Cookie linkUser (giữ nguyên hành vi cũ)
          const linkCookieParts = [
            `linkUser=${encodeURIComponent(safeStaff.username)}`,
            "path=/",
            "SameSite=Lax",
            "Max-Age=2592000", // 30 ngày
          ];
          if (typeof window !== "undefined" && window.location.protocol === "https:") {
            linkCookieParts.push("Secure");
          }
          document.cookie = linkCookieParts.join("; ");

          // Cookie staffRole & staffDept giống trang sign-in (phiên dài ~10 năm)
          const cookieBase = ["path=/", "SameSite=Lax", "Max-Age=315360000"];
          if (typeof window !== "undefined" && window.location.protocol === "https:") {
            cookieBase.push("Secure");
          }
          document.cookie = [`staffRole=${encodeURIComponent(safeStaff.role)}`, ...cookieBase].join("; ");
          document.cookie = [`staffDept=${encodeURIComponent(safeStaff.department || "")}`, ...cookieBase].join("; ");
        } catch {
          // Nếu có lỗi lưu localStorage/cookie thì vẫn cố gắng cho vào màn hình đăng nhập
        }

        const target = safeStaff.department === "NQ" ? "/daily-report" : "/asset-entry";
        router.replace(target);
      })();
      return;
    }

    // Backward-compat: nếu có staff từ luồng cũ, vẫn hoạt động như bình thường
    if (staff && typeof staff.username === "string" && staff.username.trim()) {
      try {
        window.localStorage.setItem("loggedInStaff", JSON.stringify(staff));
        const cookieParts = [
          `linkUser=${encodeURIComponent(staff.username)}`,
          "path=/",
          "SameSite=Lax",
          "Max-Age=2592000", // 30 ngày
        ];
        if (typeof window !== "undefined" && window.location.protocol === "https:") {
          cookieParts.push("Secure");
        }
        document.cookie = cookieParts.join("; ");

        const cookieBase = ["path=/", "SameSite=Lax", "Max-Age=315360000"];
        if (typeof window !== "undefined" && window.location.protocol === "https:") {
          cookieBase.push("Secure");
        }
        document.cookie = [`staffRole=${encodeURIComponent(staff.role)}`, ...cookieBase].join("; ");
        document.cookie = [`staffDept=${encodeURIComponent(staff.department || "")}`, ...cookieBase].join("; ");
      } catch {}
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