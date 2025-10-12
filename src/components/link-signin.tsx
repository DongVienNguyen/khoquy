"use client";

import React from "react";
import { useRouter } from "next/navigation";

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

const LinkSignIn: React.FC<Props> = ({ staff, username }) => {
  const router = useRouter();

  React.useEffect(() => {
    const uname = typeof username === "string" ? username.trim() : "";

    // Fast path: nếu có username trong URL, tin tưởng hoàn toàn và vào luôn
    if (uname) {
      try {
        const minimal: SafeStaff = {
          id: `link-${uname}`,
          username: uname,
          staff_name: uname,
          email: null,
          role: "user",
          department: null,
          account_status: "active",
        };
        window.localStorage.setItem("loggedInStaff", JSON.stringify(minimal));

        const cookieParts = [
          `linkUser=${encodeURIComponent(uname)}`,
          "path=/",
          "SameSite=Lax",
          "Max-Age=2592000", // 30 ngày
        ];
        if (typeof window !== "undefined" && window.location.protocol === "https:") {
          cookieParts.push("Secure");
        }
        document.cookie = cookieParts.join("; ");
      } catch {}
      router.replace("/asset-entry");
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
      } catch {}
      router.replace("/asset-entry");
      return;
    }

    // Trường hợp không có username hợp lệ
    router.replace("/sign-in");
  }, [router, staff, username]);

  return null;
};

export default LinkSignIn;