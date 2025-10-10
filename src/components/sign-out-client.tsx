"use client";

import React from "react";
import { useRouter } from "next/navigation";

const SignOutClient: React.FC = () => {
  const router = useRouter();

  React.useEffect(() => {
    try {
      window.localStorage.removeItem("loggedInStaff");
      // Clear cookie 'linkUser' để kết thúc phiên 'đi link'
      const cookieParts = [
        "linkUser=",
        "Max-Age=0",
        "path=/",
        "SameSite=Lax",
      ];
      if (typeof window !== "undefined" && window.location.protocol === "https:") {
        cookieParts.push("Secure");
      }
      document.cookie = cookieParts.join("; ");
      
      // Clear cookie hạn chế vai trò/phòng ban
      const kill = (name: string) => {
        const parts = [`${name}=`, "Max-Age=0", "path=/", "SameSite=Lax"];
        if (typeof window !== "undefined" && window.location.protocol === "https:") parts.push("Secure");
        document.cookie = parts.join("; ");
      };
      kill("staffRole");
      kill("staffDept");
    } catch {}
    router.replace("/sign-in");
  }, [router]);

  return null;
};

export default SignOutClient;