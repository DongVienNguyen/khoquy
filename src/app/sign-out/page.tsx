import React from "react";
// Removed server-side cookies mutation; we clear on client in SignOutClient
import SignOutClient from "@/components/sign-out-client";

export default function SignOutPage() {
  return (
    <div className="min-h-screen w-full grid place-items-center p-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Đang đăng xuất...</h1>
        <p className="text-muted-foreground">Vui lòng chờ trong giây lát.</p>
      </div>
      <SignOutClient />
    </div>
  );
}