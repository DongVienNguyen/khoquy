import React from "react";
import LinkSignIn from "@/components/link-signin";
import { redirect } from "next/navigation";

type SafeStaff = {
  id: string;
  username: string;
  staff_name: string;
  email: string | null;
  role: "admin" | "user";
  department: string | null;
  account_status: "active" | "locked";
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aytwkszqdnylsbufksmf.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dHdrc3pxZG55bHNidWZrc21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4ODcyMDYsImV4cCI6MjA3NTQ2MzIwNn0.lLZbIEG26IgWGZsuyM7v8X6LnGURA8avB4Gxnkboplg";

async function linkLookup(usernameRaw: string): Promise<SafeStaff | null> {
  const username = String(usernameRaw || "").trim();
  if (!username) return null;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/staff-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action: "link-lookup", username }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) return null;
  return json.data as SafeStaff;
}

export default async function Page({ params }: { params: { username: string } }) {
  const usernameParam = params?.username || "";
  const staff = await linkLookup(usernameParam);
  if (!staff) {
    redirect("/sign-in");
  }

  // Trang chuyển tiếp: client sẽ ghi localStorage và chuyển sang /asset-entry
  return (
    <div className="min-h-screen w-full grid place-items-center p-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Đang xác thực bằng link</h1>
        <p className="text-muted-foreground">Vui lòng chờ trong giây lát...</p>
      </div>
      <LinkSignIn staff={staff as SafeStaff} />
    </div>
  );
}