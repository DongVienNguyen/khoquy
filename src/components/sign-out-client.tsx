"use client";

import React from "react";
import { useRouter } from "next/navigation";

const SignOutClient: React.FC = () => {
  const router = useRouter();

  React.useEffect(() => {
    try {
      window.localStorage.removeItem("loggedInStaff");
    } catch {}
    router.replace("/sign-in");
  }, [router]);

  return null;
};

export default SignOutClient;