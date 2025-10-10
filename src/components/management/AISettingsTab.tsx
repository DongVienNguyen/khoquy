"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";

type AISettings = {
  default_provider: "openrouter" | "custom";
  openrouter_api_key?: string | null;
  openrouter_base_url?: string | null;
  default_openrouter_model?: string | null;
  custom_api_key?: string | null;
  custom_base_url?: string | null;
  custom_model?: string | null;
  // Thêm mới
  external_sync_enabled?: boolean;
  external_sync_interval_minutes?: number;
};

const AI_SETTINGS_KEY = "ai_settings_v1";

const defaults: AISettings = {
  default_provider: "custom",
  openrouter_api_key: "",
  openrouter_base_url: "https://openrouter.ai/api/v1",
  default_openrouter_model: "openrouter/auto",
  custom_api_key: "",
  custom_base_url: "https://v98store.com",
  custom_model: "gpt-4o-mini",
  // Thêm mặc định
  external_sync_enabled: false,
  external_sync_interval_minutes: 2,
};

export default function AISettingsTab() {
  const [settings, setSettings] = useState<AISettings>(defaults);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const provider = useMemo(() => settings.default_provider, [settings.default_provider]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", AI_SETTINGS_KEY)
          .limit(1)
          .maybeSingle();

        if (data?.setting_value) {
          const parsed = JSON.parse(data.setting_value);
          if (parsed && typeof parsed === "object") {
            setSettings({ ...defaults, ...parsed });
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // ignore
      }
      try {
        const saved = localStorage.getItem(AI_SETTINGS_KEY);
        if (saved) {
          setSettings({ ...defaults, ...(JSON.parse(saved) || {}) });
        } else {
          setSettings(defaults);
        }
      } catch {
        setSettings(defaults);
      }
      setIsLoading(false);
    })();
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      // Basic validation
      const baseUrl =
        provider === "openrouter"
          ? (settings.openrouter_base_url || "").trim()
          : (settings.custom_base_url || "").trim();

      if (!/^https?:\/\//.test(baseUrl)) {
        toast.error("Base URL không hợp lệ. Vui lòng nhập URL bắt đầu bằng http(s)://");
        setIsSaving(false);
        return;
      }

      const now = new Date().toISOString();
      const payload = {
        setting_key: AI_SETTINGS_KEY,
        setting_value: JSON.stringify(settings),
        setting_type: "ai_settings",
        updated_date: now,
        created_date: now,
      };

      const { error } = await supabase
        .from("system_settings")
        .upsert(payload, { onConflict: "setting_key" });
      if (error) throw error;

      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
      toast.success("Đã lưu cấu hình AI mặc định.");
    } catch (e: any) {
      toast.error(e?.message || "Không thể lưu cấu hình.");
    } finally {
      setIsSaving(false);
    }
  };

  const setDefaultProvider = (p: "openrouter" | "custom") => {
    setSettings((prev) => ({ ...prev, default_provider: p }));
  };

  const syncNow = async () => {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    try {
      const { data, error } = await supabase.functions.invoke("sync-asset-transactions", {
        body: { date: todayStr },
        headers: { Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}` },
      });
      if (error) {
        toast.error("Đồng bộ thất bại.");
        return;
      }
      const res: any = data?.data ?? data;
      toast.success(`Đồng bộ xong: +${res?.inserted || 0} mới, ${res?.updated || 0} cập nhật, ${res?.skipped || 0} bỏ qua.`);
    } catch (e: any) {
      toast.error(e?.message || "Có lỗi khi gọi đồng bộ.");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Đang tải cấu hình AI...</div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cài đặt nhà cung cấp mặc định</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Provider</Label>
          <Select
            value={settings.default_provider}
            onValueChange={(v) =>
              setSettings((prev) => ({ ...prev, default_provider: v as "openrouter" | "custom" }))
            }
          >
            <SelectTrigger className="h-10"><SelectValue placeholder="Chọn provider" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom AI (OpenAI-compatible)</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button variant={provider === "custom" ? "default" : "outline"} onClick={() => setDefaultProvider("custom")}>
              Đặt Custom làm mặc định
            </Button>
            <Button variant={provider === "openrouter" ? "default" : "outline"} onClick={() => setDefaultProvider("openrouter")}>
              Đặt OpenRouter làm mặc định
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>OpenRouter</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={settings.openrouter_api_key || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, openrouter_api_key: e.target.value }))}
              placeholder="sk-or-v1-..."
            />
            <p className="text-xs text-muted-foreground">API Key cho OpenRouter</p>
          </div>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={settings.openrouter_base_url || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, openrouter_base_url: e.target.value }))}
              placeholder="https://openrouter.ai/api/v1"
            />
            <p className="text-xs text-muted-foreground">Truy cập nhiều AI models qua một API</p>
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Input
              value={settings.default_openrouter_model || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, default_openrouter_model: e.target.value }))}
              placeholder="openrouter/auto"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Custom AI</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={settings.custom_api_key || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, custom_api_key: e.target.value }))}
              placeholder="••••••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={settings.custom_base_url || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, custom_base_url: e.target.value }))}
              placeholder="https://v98store.com"
            />
            <p className="text-xs text-muted-foreground">OpenAI-compatible; hệ thống sẽ gọi: base/v1/chat/completions</p>
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Input
              value={settings.custom_model || ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, custom_model: e.target.value }))}
              placeholder="gpt-4o-mini"
            />
          </div>
        </CardContent>
      </Card>

      {/* Nhóm mới: Đồng bộ API AssetTransaction */}
      <Card>
        <CardHeader>
          <CardTitle>Đồng bộ API AssetTransaction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Bật đồng bộ API</Label>
              <p className="text-xs text-muted-foreground">
                Chỉ đồng bộ dữ liệu NGÀY HÔM NAY (GMT+7). Không xóa, chỉ insert/update.
              </p>
            </div>
            <Switch
              checked={!!settings.external_sync_enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, external_sync_enabled: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Chu kỳ đồng bộ (phút)</Label>
            <Select
              value={String(settings.external_sync_interval_minutes ?? 2)}
              onValueChange={(v) =>
                setSettings((prev) => ({ ...prev, external_sync_interval_minutes: Number(v) }))
              }
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Chọn chu kỳ" />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4", "5"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m} phút
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={syncNow} variant="outline" className="bg-blue-50 hover:bg-blue-100 text-blue-700">
              Đồng bộ ngay
            </Button>
            <p className="text-xs text-muted-foreground">Bấm để chạy đồng bộ ngay lập tức.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
          {isSaving ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
      </div>
    </div>
  );
}