import React from "react";
import LinkSignIn from "@/components/link-signin";

export default function Page({ params }: { params: { username: string } }) {
  const username = String(params?.username || "").trim();

  return (
    <div className="min-h-screen w-full grid place-items-center p-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Đang xác thực bằng link</h1>
        <p className="text-muted-foreground">Vui lòng chờ trong giây lát...</p>
      </div>
      <LinkSignIn username={username} />
    </div>
  );
}