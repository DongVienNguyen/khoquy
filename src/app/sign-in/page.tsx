"use client";

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";
import { LogIn, Mail, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});

type FormValues = z.infer<typeof schema>;

export default function SignInPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/asset-entry");
      }
    });
  }, [router]);

  const onSubmit = async (values: FormValues) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      toast.error(error.message || "Đăng nhập thất bại");
      return;
    }
    if (data.session) {
      toast.success("Đăng nhập thành công");
      router.push("/asset-entry");
    }
  };

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center">
      <SonnerToaster />
      <div className="w-full max-w-md rounded-lg border bg-card shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <LogIn className="text-primary" />
          <h1 className="text-xl font-semibold">Đăng nhập</h1>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <div className="flex items-center gap-2 rounded-md border bg-background px-3">
              <Mail className="text-muted-foreground" size={18} />
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full h-10 bg-transparent outline-none"
                {...register("email")}
              />
            </div>
            {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mật khẩu</label>
            <div className="flex items-center gap-2 rounded-md border bg-background px-3">
              <Lock className="text-muted-foreground" size={18} />
              <input
                type="password"
                placeholder="••••••••"
                className="w-full h-10 bg-transparent outline-none"
                {...register("password")}
              />
            </div>
            {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition"
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}