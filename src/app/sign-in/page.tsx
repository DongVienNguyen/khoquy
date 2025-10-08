"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";
import { Package, User as UserIcon, Lock as LockIcon, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase/client";

type SafeStaff = {
  id: string;
  username: string;
  staff_name: string;
  email: string | null;
  role: "admin" | "user";
  department: string | null;
  account_status: "active" | "locked";
};

// XÓA hằng số FUNCTION_URL hiện tại
// const FUNCTION_URL = "https://aytwkszqdnylsbufksmf.supabase.co/functions/v1/staff-login";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const checkTimer = useRef<number | null>(null);

  // Seed admin account once
  useEffect(() => {
    const runSeed = async () => {
      await supabase.functions.invoke("staff-login", {
        body: { action: "ensure-admin" },
      });
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
        const { data, error } = await supabase.functions.invoke("staff-login", {
          body: { action: "check", username: username.trim() },
        });
        if (error) {
          // Giữ im lặng để người dùng thử lại, tránh vỡ UI
          return;
        }
        if (data?.ok) {
          const locked = Boolean(data?.data?.locked);
          setIsAccountLocked(locked);
          setShowForm(!locked);
          setError(locked ? "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị." : "");
        } else {
          setIsAccountLocked(false);
          setShowForm(true);
          setError("");
        }
      } catch {
        // Không che lỗi thêm
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
      const { data, error } = await supabase.functions.invoke("staff-login", {
        body: {
          action: "login",
          username: username.trim(),
          password,
        },
      });

      if (error) {
        setError(error.message || "Không thể kết nối máy chủ. Vui lòng thử lại.");
        return;
      }

      if (data?.ok) {
        const staff: SafeStaff = data.data;
        localStorage.setItem("loggedInStaff", JSON.stringify(staff));
        toast.success("Đăng nhập thành công");
        router.replace("/asset-entry");
      } else {
        const msg: string = data?.error || "Tên đăng nhập hoặc mật khẩu không đúng";
        setError(msg);
        if (data?.locked) {
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
      <SonnerToaster />
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