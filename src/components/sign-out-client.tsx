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
    } catch {}
    router.replace("/sign-in");
  }, [router]);

  return null;
};

export default SignOutClient;