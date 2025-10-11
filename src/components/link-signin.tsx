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

const LinkSignIn: React.FC<{ staff: SafeStaff }> = ({ staff }) => {
  const router = useRouter();

  React.useEffect(() => {
    try {
      window.localStorage.setItem("loggedInStaff", JSON.stringify(staff));
      // Set cookie 'linkUser' để middleware nhận diện phiên 'đi link'
      const cookieParts = [
        `linkUser=${encodeURIComponent(staff.username)}`,
        "path=/",
        "SameSite=Lax",
        "Max-Age=604800", // 7 ngày
      ];
      if (typeof window !== "undefined" && window.location.protocol === "https:") {
        cookieParts.push("Secure");
      }
      document.cookie = cookieParts.join("; ");
    } catch {}
    router.replace("/asset-entry");
  }, [router, staff]);

  return null;
};

export default LinkSignIn;