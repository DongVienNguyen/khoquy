"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, User as UserIcon, Lock as LockIcon, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

// Thêm URL fallback cho Edge Function
const FUNCTION_URL = `${SUPABASE_PUBLIC_URL}/functions/v1/staff-login`;

// Thêm helper gọi function với fallback
async function callStaffLogin(body: Record<string, any>) {
  // 1) Thử invoke qua client
  try {
    const { data, error } = await supabase.functions.invoke("staff-login", { body });
    if (!error) {
      return { ok: true, data };
    }
  } catch {
    // bỏ qua để fallback
  }

  // 2) Fallback: fetch trực tiếp
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

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const checkTimer = useRef<number | null>(null);

  // Thêm helper đọc cookie và tự động chuyển hướng nếu đã có phiên
  const getCookie = (name: string) => {
    if (typeof document === "undefined") return "";
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()!.split(";").shift() || "";
    return "";
  };

  useEffect(() => {
    try {
      const role = getCookie("staffRole");
      const raw = window.localStorage.getItem("loggedInStaff");
      if (role && raw) {
        const staff = JSON.parse(raw) as SafeStaff;
        const target = staff?.department === "NQ" ? "/daily-report" : "/asset-entry";
        router.replace(target);
      }
    } catch {}
  }, [router]);

  // Seed admin account once
  useEffect(() => {
    const runSeed = async () => {
      try {
        await callStaffLogin({ action: "ensure-admin" });
      } catch {
        // Không để lỗi seed làm vỡ UI
      }
    };
    runSeed();
  }, []);

  // Debounced check account status when username changes
  useEffect(() => {
    if (checkTimer.current) {
      window.clearTimeout(checkTimer.current);
      checkTimer.current = null;
    }
    if (!username.trim()) {
      setIsAccountLocked(false);
      setShowForm(true);
      setError("");
      return;
    }
    checkTimer.current = window.setTimeout(async () => {
      try {
        const result = await callStaffLogin({ action: "check", username: username.trim() });
        if (result.ok) {
          const payload: any = result.data;
          if (payload?.ok) {
            const locked = Boolean(payload?.data?.locked);
            setIsAccountLocked(locked);
            setShowForm(!locked);
            setError(locked ? "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị." : "");
          } else {
            setIsAccountLocked(false);
            setShowForm(true);
            setError("");
          }
        }
      } catch {
        // im lặng để người dùng thử lại
      }
    }, 500);
    return () => {
      if (checkTimer.current) {
        window.clearTimeout(checkTimer.current);
        checkTimer.current = null;
      }
    };
  }, [username]);

  const canSubmit = useMemo(() => {
    return !!username.trim() && !!password;
  }, [username, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (isAccountLocked) {
      setShowForm(false);
      setError("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị.");
      return;
    }
    if (!canSubmit) return;

    setIsLoading(true);
    try {
      const result = await callStaffLogin({
        action: "login",
        username: username.trim(),
        password,
      });

      if (!result.ok) {
        setError(typeof result.error === "string" ? result.error : "Không thể kết nối đến dịch vụ đăng nhập.");
        return;
      }

      const payload: any = result.data;
      if (payload?.ok) {
        const staff: SafeStaff = payload.data;
        localStorage.setItem("loggedInStaff", JSON.stringify(staff));
        // Set cookie cho middleware
        try {
          // Đổi từ 7 ngày thành ~10 năm để phiên không tự hết hạn
          const cookieBase = ["path=/", "SameSite=Lax", "Max-Age=315360000"]; // ~10 năm
          if (typeof window !== "undefined" && window.location.protocol === "https:") cookieBase.push("Secure");
          document.cookie = [`staffRole=${encodeURIComponent(staff.role)}`, ...cookieBase].join("; ");
          document.cookie = [`staffDept=${encodeURIComponent(staff.department || "")}`, ...cookieBase].join("; ");
        } catch {}
        toast.success("Đăng nhập thành công");
        const target = staff?.department === "NQ" ? "/daily-report" : "/asset-entry";
        router.replace(target);
      } else {
        const msg: string = payload?.error || "Tên đăng nhập hoặc mật khẩu không đúng";
        setError(msg);
        if (payload?.locked) {
          setIsAccountLocked(true);
          setShowForm(false);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const tryOtherAccount = () => {
    setUsername("");
    setPassword("");
    setError("");
    setIsAccountLocked(false);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-muted/40 to-background p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-blue-600 text-white grid place-items-center shadow-lg">
            <Package size={28} />
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Đăng nhập</h1>
          <p className="mt-1 text-muted-foreground">
            Truy cập hệ thống quản lý tài sản kho
          </p>
        </div>

        {/* Card: Thông tin đăng nhập */}
        <Card className="border-0 shadow-2xl">
          <CardContent className="pt-6">
            <h2 className="text-center font-semibold mb-4">Thông tin đăng nhập</h2>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Lỗi</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {showForm ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Tên đăng nhập</label>
                  <div className="flex items-center gap-2 rounded-md border bg-background px-3">
                    <UserIcon className="text-muted-foreground" size={18} />
                    <Input
                      type="text"
                      placeholder="Nhập tên đăng nhập"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="h-10 border-0 shadow-none focus-visible:ring-0"
                      autoComplete="username"
                      autoCorrect="off"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Mật khẩu</label>
                  <div className="flex items-center gap-2 rounded-md border bg-background px-3">
                    <LockIcon className="text-muted-foreground" size={18} />
                    <Input
                      type="password"
                      placeholder="Nhập mật khẩu"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 border-0 shadow-none focus-visible:ring-0"
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="mt-2 text-right">
                    <a href="/reset-password" className="text-sm text-blue-600 hover:underline">
                      Reset mật khẩu
                    </a>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={!canSubmit || isLoading || isAccountLocked}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Tài khoản bị khóa</AlertTitle>
                  <AlertDescription>
                    Vui lòng liên hệ quản trị viên để mở khóa hoặc thử tài khoản khác.
                  </AlertDescription>
                </Alert>
                <Button variant="outline" className="w-full" onClick={tryOtherAccount}>
                  Thử tài khoản khác
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}