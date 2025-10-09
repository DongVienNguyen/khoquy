"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_ANON_KEY } from "@/lib/supabase/client";
import { toast } from "sonner";
import { SonnerToaster } from "@/components/ui/sonner";
import { 
  Settings, Trash as TrashIcon, Archive, Download, Upload, Plus, Edit, Lock, AlertCircle, 
  BarChart3, Users, Database, ChevronUp, ChevronDown, Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type SafeStaff = {
  id: string;
  username: string;
  staff_name: string;
  email: string | null;
  role: "admin" | "user";
  department: string | null;
  account_status: "active" | "locked";
};

const FUNCTION_URL = `${SUPABASE_PUBLIC_URL}/functions/v1/asset-transactions`;
async function callAssetFunc(body: Record<string, any>) {
  try {
    const { data, error } = await supabase.functions.invoke("asset-transactions", {
      body,
      headers: { Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}` },
    });
    if (!error) {
      const payload: any = data;
      return { ok: true, data: payload?.data ?? payload };
    }
  } catch {}
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
    if (res.ok && json) return { ok: true, data: (json as any).data };
    return { ok: false, error: (json as any)?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to fetch" };
  }
}

// CSV utilities
const textEncoder = new TextEncoder();
const toBytes = (s: string) => textEncoder.encode(s);
let CRC32_TABLE: Uint32Array | null = null;
const makeCrc32Table = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)) >>> 0;
    table[i] = c >>> 0;
  }
  return table;
};
const crc32 = (data: Uint8Array) => {
  if (!CRC32_TABLE) CRC32_TABLE = makeCrc32Table();
  let crc = 0 ^ (-1);
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xFF];
  return (crc ^ (-1)) >>> 0;
};
const u16 = (n: number) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]);
const u32 = (n: number) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
const concatBytes = (arrays: Uint8Array[]) => {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  arrays.forEach(a => { out.set(a, off); off += a.length; });
  return out;
};
const buildZip = (files: { name: string; data: Uint8Array | string }[]) => {
  const chunks: Uint8Array[] = [];
  const fileRecords: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  files.forEach((f) => {
    const nameBytes = toBytes(f.name);
    const data = f.data instanceof Uint8Array ? f.data : toBytes(String(f.data || ""));
    const crc = crc32(data);
    const compSize = data.length;
    const uncompSize = data.length;
    const localHeader = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate), u32(crc),
      u32(compSize), u32(uncompSize), u16(nameBytes.length), u16(0)
    ]);
    chunks.push(localHeader, nameBytes, data);
    const localHeaderOffset = offset;
    offset += localHeader.length + nameBytes.length + data.length;
    const centralHeader = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate), u32(crc),
      u32(compSize), u32(uncompSize), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(localHeaderOffset), nameBytes
    ]);
    fileRecords.push(centralHeader);
  });
  const centralDirectoryStart = offset;
  const centralDirectory = concatBytes(fileRecords);
  const eocd = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDirectory.length), u32(centralDirectoryStart), u16(0)
  ]);
  const zipBytes = concatBytes([...chunks, centralDirectory, eocd]);
  return new Blob([zipBytes], { type: "application/zip" });
};

// Entity config for existing tables
type FieldType = "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "password" | "json";
type EntityField = { key: string; label: string; type: FieldType; options?: string[] };
type EntityConfigItem = { table: string; name: string; fields: EntityField[]; defaultSort?: string };

const ROOMS = ["QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH"];
const entityConfig: Record<string, EntityConfigItem> = {
  AssetTransaction: {
    table: "asset_transactions",
    name: "Giao dịch tài sản",
    defaultSort: "-transaction_date",
    fields: [
      { key: "transaction_date", label: "Ngày giao dịch", type: "date" },
      { key: "parts_day", label: "Buổi", type: "select", options: ["Sáng", "Chiều"] },
      { key: "room", label: "Phòng", type: "select", options: ROOMS },
      { key: "transaction_type", label: "Loại tác nghiệp", type: "select", options: ["Xuất kho", "Mượn TS", "Thay bìa"] },
      { key: "asset_year", label: "Năm TS", type: "number" },
      { key: "asset_code", label: "Mã TS", type: "number" },
      { key: "staff_code", label: "Mã nhân viên", type: "text" },
      { key: "note", label: "Ghi chú", type: "text" },
      { key: "is_deleted", label: "Đã xóa mềm", type: "select", options: ["true", "false"] },
    ],
  },
  ProcessedNote: {
    table: "processed_notes",
    name: "Ghi chú đã xử lý",
    defaultSort: "-created_date",
    fields: [
      { key: "room", label: "Phòng", type: "select", options: [...ROOMS, "NQ"] },
      { key: "operation_type", label: "Loại tác nghiệp", type: "select", options: ["Hoàn trả", "Xuất kho", "Nhập kho", "Xuất mượn", "Thiếu CT", "Khác"] },
      { key: "content", label: "Nội dung", type: "textarea" },
      { key: "staff_code", label: "Mã nhân viên", type: "text" },
      { key: "is_done", label: "Đã xong", type: "select", options: ["true", "false"] },
      { key: "mail_to_nv", label: "Mail đến NV", type: "text" },
    ],
  },
  TakenAssetStatus: {
    table: "taken_asset_status",
    name: "Trạng thái TS đã lấy",
    defaultSort: "-marked_at",
    fields: [
      { key: "transaction_id", label: "ID giao dịch", type: "text" },
      { key: "user_username", label: "Username", type: "text" },
      { key: "week_year", label: "Tuần-Năm", type: "text" },
      { key: "marked_at", label: "Thời gian đánh dấu", type: "datetime-local" },
    ],
  },
  EmailUser: {
    table: "email_users",
    name: "Người dùng email",
    defaultSort: "-updated_date",
    fields: [
      { key: "username", label: "Username", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "full_name", label: "Tên đầy đủ", type: "text" },
      { key: "last_email_sent", label: "Email cuối (GMT+7)", type: "datetime-local" },
      { key: "last_notification_sent", label: "Thông báo cuối (GMT+7)", type: "datetime-local" },
    ],
  },
  Notification: {
    table: "notifications",
    name: "Thông báo hệ thống",
    defaultSort: "-created_at",
    fields: [
      { key: "title", label: "Tiêu đề", type: "text" },
      { key: "message", label: "Nội dung", type: "textarea" },
      { key: "recipient_username", label: "Người nhận", type: "text" },
      { key: "notification_type", label: "Loại thông báo", type: "select", options: ["asset_reminder", "crc_reminder", "general"] },
      { key: "is_read", label: "Đã đọc", type: "select", options: ["true", "false"] },
      { key: "related_data", label: "Dữ liệu liên quan", type: "json" },
    ],
  },
  Staff: {
    table: "staff",
    name: "Nhân viên",
    defaultSort: "-updated_date",
    fields: [
      { key: "username", label: "Tên đăng nhập", type: "text" },
      { key: "password", label: "Mật khẩu", type: "password" },
      { key: "staff_name", label: "Tên nhân viên", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "role", label: "Quyền", type: "select", options: ["admin", "user"] },
      { key: "department", label: "Phòng ban", type: "text" },
      { key: "account_status", label: "Trạng thái", type: "select", options: ["active", "locked"] },
      { key: "failed_login_attempts", label: "Số lần sai", type: "number" },
      { key: "last_failed_login", label: "Sai cuối", type: "datetime-local" },
      { key: "locked_at", label: "Khóa lúc", type: "datetime-local" },
    ],
  },
};

// Helper for CSV
const buildEntityCSV = (entityKey: string, records: any[]) => {
  const config = entityConfig[entityKey];
  if (!config || !Array.isArray(records)) return "";
  const headers = (config.fields || []).map(f => f.label || f.key);
  const keys = (config.fields || []).map(f => f.key);
  const escape = (val: any, fieldType?: FieldType) => {
    if (val === null || val === undefined) return "";
    let v = typeof val === "object" && fieldType === "json" ? JSON.stringify(val) : String(val);
    if (typeof val === "boolean") v = val ? "true" : "false";
    if ((fieldType === "date" || fieldType === "datetime-local") && v) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) v = fieldType === "date" ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
      else v = "";
    }
    v = v.replace(/"/g, '""');
    if (v.includes(",") || v.includes("\n") || v.includes("\r")) v = `"${v}"`;
    return v;
  };
  const rows = [headers.map(h => escape(h)).join(",")];
  records.forEach(item => {
    const row = keys.map(key => {
      const field = config.fields.find(f => f.key === key);
      return escape(item?.[key], field?.type);
    });
    rows.push(row.join(","));
  });
  return rows.join("\n");
};

// Local settings for auto-delete
const SETTINGS_KEY = "auto_delete_settings_v3";

function getLoggedInStaff(): SafeStaff | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("loggedInStaff") : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string") return parsed as SafeStaff;
    return null;
  } catch { return null; }
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export default function ManagementPage() {
  const router = useRouter();
  const [currentStaff, setCurrentStaff] = useState<SafeStaff | null>(null);
  const isAdmin = useMemo(() => currentStaff?.role === "admin", [currentStaff?.role]);

  const [message, setMessage] = useState<{ type: "" | "success" | "error" | "info"; text: string }>({ type: "", text: "" });

  // Tabs
  const [tab, setTab] = useState<"stats" | "data" | "overview">("stats");

  // Data tab states
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [visibleColumnsMap, setVisibleColumnsMap] = useState<Record<string, string[]>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Stats tab progress
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteStatusText, setDeleteStatusText] = useState("");
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isComboProcessing, setIsComboProcessing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);

  // Overview tab states
  const [overviewCounts, setOverviewCounts] = useState<Record<string, number>>({});
  const [autoDeleteSettings, setAutoDeleteSettings] = useState<Record<string, { enabled: boolean; interval: string }>>({});

  useEffect(() => {
    const staff = getLoggedInStaff();
    if (!staff || staff.role !== "admin") {
      router.replace("/asset-entry");
      return;
    }
    setCurrentStaff(staff);
    // load settings
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) setAutoDeleteSettings(JSON.parse(saved));
    } catch {}
  }, [router]);

  // Visible columns persistence
  const loadVisibleColumns = useCallback((entityKey: string) => {
    const storageKey = `visible_cols_${entityKey}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const cols = JSON.parse(saved);
        setVisibleColumnsMap(prev => ({ ...prev, [entityKey]: Array.isArray(cols) ? cols : [] }));
      } catch {
        const defaults = (entityConfig[entityKey]?.fields || []).map(f => f.key);
        setVisibleColumnsMap(prev => ({ ...prev, [entityKey]: defaults }));
      }
    } else {
      const defaults = (entityConfig[entityKey]?.fields || []).map(f => f.key);
      setVisibleColumnsMap(prev => ({ ...prev, [entityKey]: defaults }));
    }
  }, []);
  const visibleColumns = useMemo(() => {
    if (!selectedEntity || !entityConfig[selectedEntity]) return [];
    const allKeys = (entityConfig[selectedEntity].fields || []).map(f => f.key);
    const saved = visibleColumnsMap[selectedEntity];
    return Array.isArray(saved) && saved.length ? saved.filter(k => allKeys.includes(k)) : allKeys;
  }, [selectedEntity, visibleColumnsMap]);
  const toggleVisibleColumn = useCallback((key: string) => {
    if (!selectedEntity) return;
    const storageKey = `visible_cols_${selectedEntity}`;
    const current = Array.isArray(visibleColumnsMap[selectedEntity]) ? visibleColumnsMap[selectedEntity] : (entityConfig[selectedEntity]?.fields || []).map(f => f.key);
    const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    setVisibleColumnsMap(prev => ({ ...prev, [selectedEntity]: next }));
    localStorage.setItem(storageKey, JSON.stringify(next));
  }, [selectedEntity, visibleColumnsMap]);

  // Entity change
  const handleEntityChange = useCallback((entityKey: string) => {
    setSelectedEntity(entityKey);
    setSearchTerm("");
    setCurrentPage(1);
    setSortKey(null);
    setSortDirection("asc");
    setColumnFilters({});
    loadVisibleColumns(entityKey);
  }, [loadVisibleColumns]);

  // Load data
  const loadData = useCallback(async () => {
    if (!selectedEntity) return;
    setIsLoading(true);
    setCurrentPage(1);
    try {
      const config = entityConfig[selectedEntity];
      if (!config) {
        setData([]);
        return;
      }
      // Prefer edge function for AssetTransaction & ProcessedNote & TakenAssetStatus
      let result: any[] = [];
      if (selectedEntity === "AssetTransaction") {
        const res = await callAssetFunc({ action: "list_range", start: "1900-01-01", end: "2100-12-31", include_deleted: true });
        if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể tải dữ liệu");
        result = Array.isArray(res.data) ? res.data : [];
      } else if (selectedEntity === "ProcessedNote") {
        const res = await callAssetFunc({ action: "list_notes" });
        if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể tải dữ liệu");
        result = Array.isArray(res.data) ? res.data : [];
      } else if (selectedEntity === "TakenAssetStatus") {
        // Tải toàn bộ theo tuần hiện tại của admin (nếu cần), mặc định lấy tất cả để quản lý
        const { data, error } = await supabase.from("taken_asset_status").select("*").order("marked_at", { ascending: false });
        if (error) throw error;
        result = data || [];
      } else {
        const { data, error } = await supabase.from(config.table).select("*").order(config.defaultSort?.replace("-", "") || "created_date", { ascending: !config.defaultSort?.startsWith("-") });
        if (error) throw error;
        result = data || [];
      }
      setData(result);
    } catch (e: any) {
      console.error("loadData error:", e);
      setData([]);
      setMessage({ type: "error", text: e?.message || "Có lỗi xảy ra khi tải dữ liệu!" });
    } finally {
      setIsLoading(false);
    }
  }, [selectedEntity]);

  useEffect(() => {
    if (selectedEntity) loadData();
  }, [selectedEntity, loadData]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, columnFilters, sortKey, sortDirection]);

  // Filters/search/sort/pagination
  const filteredData = useMemo(() => {
    if (!selectedEntity || !Array.isArray(data)) return data || [];
    const config = entityConfig[selectedEntity];
    if (!config) return [];
    const hasGlobalSearch = !!searchTerm.trim();
    const hasColumnFilters = Object.values(columnFilters || {}).some(v => v);
    if (!hasGlobalSearch && !hasColumnFilters) return data;
    return data.filter(item => {
      if (!item) return false;
      const matchesSearch = !hasGlobalSearch ? true : config.fields.some(field => {
        const value = item[field.key];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      });
      if (!matchesSearch) return false;
      const columnsOk = Object.entries(columnFilters || {}).every(([key, val]) => {
        if (!val) return true;
        const field = config.fields.find(f => f.key === key);
        const itemVal = item[key];
        if (itemVal === null || itemVal === undefined) return false;
        if (field?.type === "select") return String(itemVal).toLowerCase() === String(val).toLowerCase();
        return String(itemVal).toLowerCase().includes(String(val).toLowerCase());
      });
      return columnsOk;
    });
  }, [data, searchTerm, columnFilters, selectedEntity]);

  const sortedFilteredData = useMemo(() => {
    if (!sortKey) return filteredData;
    const field = entityConfig[selectedEntity]?.fields.find(f => f.key === sortKey);
    const type = field?.type;
    const arr = [...filteredData];
    arr.sort((a, b) => {
      const va = a?.[sortKey];
      const vb = b?.[sortKey];
      if (va === null || va === undefined) return sortDirection === "asc" ? 1 : -1;
      if (vb === null || vb === undefined) return sortDirection === "asc" ? -1 : 1;
      if (type === "number") {
        const na = Number(va), nb = Number(vb);
        if (isNaN(na) && isNaN(nb)) return 0;
        if (isNaN(na)) return sortDirection === "asc" ? 1 : -1;
        if (isNaN(nb)) return sortDirection === "asc" ? -1 : 1;
        return na - nb;
      }
      if (type === "date" || type === "datetime-local") {
        const ta = new Date(va).getTime();
        const tb = new Date(vb).getTime();
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return sortDirection === "asc" ? 1 : -1;
        if (isNaN(tb)) return sortDirection === "asc" ? -1 : 1;
        return ta - tb;
      }
      const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
      if (sa < sb) return -1;
      if (sa > sb) return 1;
      return 0;
    });
    return sortDirection === "asc" ? arr : arr.reverse();
  }, [filteredData, sortKey, sortDirection, selectedEntity]);

  const totalPages = useMemo(() => Math.ceil((sortedFilteredData?.length || 0) / itemsPerPage), [sortedFilteredData, itemsPerPage]);
  const currentTableData = useMemo(() => {
    if (!Array.isArray(sortedFilteredData)) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedFilteredData.slice(startIndex, endIndex);
  }, [sortedFilteredData, currentPage, itemsPerPage]);

  // CRUD dialog
  const handleAdd = useCallback(() => {
    setEditingItem(null);
    setFormData({});
    setIsDialogOpen(true);
  }, []);
  const handleEdit = useCallback((item: any) => {
    setEditingItem(item);
    const initial: Record<string, any> = {};
    const config = entityConfig[selectedEntity];
    if (config && item) {
      config.fields.forEach(field => {
        const v = item[field.key];
        if (field.type === "datetime-local" && v) {
          try { initial[field.key] = new Date(v).toISOString().slice(0, 16); } catch { initial[field.key] = ""; }
        } else if (field.type === "date" && v) {
          try { const d = new Date(v); initial[field.key] = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; } catch { initial[field.key] = ""; }
        } else if (field.type === "json") {
          try { initial[field.key] = typeof v === "object" ? JSON.stringify(v, null, 2) : v || ""; } catch { initial[field.key] = ""; }
        } else initial[field.key] = v;
      });
    }
    setFormData(initial);
    setIsDialogOpen(true);
  }, [selectedEntity]);
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa mục này?")) return;
    const config = entityConfig[selectedEntity];
    if (!config) return;
    try {
      if (selectedEntity === "AssetTransaction") {
        const res = await callAssetFunc({ action: "hard_delete_transaction", id });
        if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể xóa");
      } else {
        const { error } = await supabase.from(config.table).delete().eq("id", id);
        if (error) throw error;
      }
      setMessage({ type: "success", text: "Xóa thành công!" });
      await loadData();
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Có lỗi xảy ra khi xóa!" });
    }
  }, [selectedEntity, loadData]);

  const handleToggleAccountStatus = useCallback(async (staff: any) => {
    if (!staff) return;
    const newStatus = staff.account_status === "locked" ? "active" : "locked";
    const patch: any = {
      account_status: newStatus,
      failed_login_attempts: 0,
      last_failed_login: null,
      locked_at: newStatus === "locked" ? new Date().toISOString() : null,
      updated_date: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from("staff").update(patch).eq("id", staff.id);
      if (error) throw error;
      setMessage({ type: "success", text: `Đã ${newStatus === "locked" ? "khóa" : "mở khóa"} tài khoản ${staff.staff_name || staff.username}!` });
      await loadData();
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Có lỗi khi thay đổi trạng thái tài khoản!" });
    }
  }, [loadData]);

  const handleSave = useCallback(async () => {
    const config = entityConfig[selectedEntity];
    if (!config) return;
    const dataToSave: Record<string, any> = { ...formData };
    config.fields.forEach(field => {
      if (field.type === "select" && ["is_done", "is_read", "is_deleted"].includes(field.key)) {
        if (dataToSave[field.key] === "true") dataToSave[field.key] = true;
        else if (dataToSave[field.key] === "false") dataToSave[field.key] = false;
        else if (dataToSave[field.key] === "") dataToSave[field.key] = null;
      }
      if ((field.type === "date" || field.type === "datetime-local") && dataToSave[field.key] === "") dataToSave[field.key] = null;
      if (field.type === "json") {
        try { dataToSave[field.key] = dataToSave[field.key] ? JSON.parse(dataToSave[field.key]) : null; } catch { /* keep string */ }
      }
    });
    try {
      if (selectedEntity === "AssetTransaction") {
        if (editingItem) {
          const res = await callAssetFunc({ action: "update_transaction", id: editingItem.id, patch: dataToSave, editor_username: currentStaff?.username || "" });
          if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể cập nhật");
        } else {
          const nowIso = new Date().toISOString();
          const res = await callAssetFunc({
            action: "create",
            staff_username: currentStaff?.username || "",
            staff_email: currentStaff?.email || null,
            staff_name: currentStaff?.staff_name || null,
            transactions: [{
              transaction_date: dataToSave.transaction_date,
              parts_day: dataToSave.parts_day,
              room: dataToSave.room,
              transaction_type: dataToSave.transaction_type,
              asset_year: Number(dataToSave.asset_year),
              asset_code: Number(dataToSave.asset_code),
              note: dataToSave.note ?? null,
              notified_at: nowIso,
            }],
          });
          if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể tạo");
        }
      } else if (selectedEntity === "ProcessedNote") {
        if (editingItem) {
          const res = await callAssetFunc({ action: "update_note_full", id: editingItem.id, patch: dataToSave });
          if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể cập nhật ghi chú" );
        } else {
          const res = await callAssetFunc({ action: "create_note", note: { ...dataToSave, created_by: currentStaff?.email || currentStaff?.username } });
          if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể tạo ghi chú");
        }
      } else {
        if (editingItem) {
          const { error } = await supabase.from(config.table).update({ ...dataToSave, updated_date: new Date().toISOString() }).eq("id", editingItem.id);
          if (error) throw error;
        } else {
          const payload = { ...dataToSave, created_date: new Date().toISOString(), updated_date: new Date().toISOString() };
          const { error } = await supabase.from(config.table).insert(payload);
          if (error) throw error;
        }
      }
      setMessage({ type: "success", text: editingItem ? "Cập nhật thành công!" : "Thêm mới thành công!" });
      setIsDialogOpen(false);
      await loadData();
    } catch (e: any) {
      console.error("save error:", e);
      setMessage({ type: "error", text: e?.message || "Có lỗi xảy ra khi lưu!" });
    }
  }, [selectedEntity, formData, editingItem, loadData, currentStaff]);

  // Bulk delete by date range (AssetTransaction only)
  const [deleteDateRange, setDeleteDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const handleBulkDelete = useCallback(async () => {
    if (!deleteDateRange.start || !deleteDateRange.end) {
      setMessage({ type: "error", text: "Vui lòng chọn ngày bắt đầu và kết thúc." });
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn XÓA TẤT CẢ giao dịch từ ${deleteDateRange.start} đến ${deleteDateRange.end}? Hành động này không thể hoàn tác.`)) return;
    setIsLoading(true);
    try {
      const res = await callAssetFunc({ action: "list_range", start: deleteDateRange.start, end: deleteDateRange.end, include_deleted: true });
      if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Không thể tải giao dịch");
      const all: any[] = Array.isArray(res.data) ? res.data : [];
      for (const t of all) {
        await callAssetFunc({ action: "hard_delete_transaction", id: t.id });
        await sleep(5);
      }
      setMessage({ type: "success", text: `Đã xóa thành công ${all.length} giao dịch.` });
      await loadData();
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Có lỗi xảy ra khi xóa hàng loạt." });
    } finally { setIsLoading(false); }
  }, [deleteDateRange, loadData]);

  // Import CSV
  const handleImportCSV = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const text: string = e.target.result;
        const lines = text.split("\n").filter(line => line.trim() !== "");
        if (lines.length <= 1) { setMessage({ type: "error", text: "Tệp CSV không có dữ liệu hoặc chỉ có tiêu đề." }); return; }
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const config = entityConfig[selectedEntity];
        if (!config) return;
        const fieldMap: Record<string, number> = {};
        config.fields.forEach(field => {
          const idx = headers.findIndex(h => h.toLowerCase() === field.label.toLowerCase());
          if (idx !== -1) fieldMap[field.key] = idx;
        });
        const importRows: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const values: string[] = [];
          let inQuote = false, cur = "";
          for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if (ch === '"') {
              if (j + 1 < line.length && line[j+1] === '"') { cur += '"'; j++; }
              else inQuote = !inQuote;
            } else if (ch === "," && !inQuote) { values.push(cur.trim()); cur = ""; }
            else cur += ch;
          }
          values.push(cur.trim());
          const item: any = {};
          let hasValid = false;
          Object.entries(fieldMap).forEach(([key, idx]) => {
            const field = config.fields.find(f => f.key === key)!;
            let v = values[idx] !== undefined ? values[idx].replace(/^"|"$/g, "") : "";
            if (field.type === "number") { const n = parseInt(v); item[key] = isNaN(n) ? null : n; }
            else if (field.type === "date") {
              if (v.includes("/")) {
                const parts = v.split("/");
                if (parts.length === 3) v = `${parts[2]}-${parts[1]}-${parts[0]}`;
              }
              item[key] = v || null;
            } else if (field.type === "datetime-local") item[key] = v || null;
            else if (field.type === "select" && ["is_done", "is_read", "is_deleted"].includes(field.key)) item[key] = v.toLowerCase() === "true";
            else if (field.type === "json") {
              try { item[key] = v ? JSON.parse(v) : null; } catch { item[key] = v || null; }
            } else item[key] = v === "" ? null : v;
            hasValid = true;
          });
          if (hasValid) importRows.push(item);
        }
        if (importRows.length === 0) { setMessage({ type: "error", text: "Không có dữ liệu hợp lệ trong tệp để import." }); return; }
        if (selectedEntity === "AssetTransaction") {
          // bulk create via edge function
          const nowIso = new Date().toISOString();
          const txs = importRows.map(r => ({
            transaction_date: r.transaction_date,
            parts_day: r.parts_day,
            room: r.room,
            transaction_type: r.transaction_type,
            asset_year: Number(r.asset_year),
            asset_code: Number(r.asset_code),
            note: r.note ?? null,
            notified_at: nowIso,
          }));
          const res = await callAssetFunc({
            action: "create",
            staff_username: currentStaff?.username || "",
            staff_email: currentStaff?.email || null,
            staff_name: currentStaff?.staff_name || null,
            transactions: txs,
          });
          if (!res.ok) throw new Error(typeof res.error === "string" ? res.error : "Import thất bại");
        } else {
          const { error } = await supabase.from(entityConfig[selectedEntity].table).insert(importRows);
          if (error) throw error;
        }
        setMessage({ type: "success", text: `Import thành công ${importRows.length} bản ghi!` });
        await loadData();
      } catch (err: any) {
        console.error("import error:", err);
        setMessage({ type: "error", text: err?.message || "Có lỗi xảy ra khi import!" });
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }, [selectedEntity, loadData, currentStaff]);

  // Export CSV
  const exportToCSV = useCallback(() => {
    if (!Array.isArray(filteredData) || filteredData.length === 0) { setMessage({ type: "info", text: "Không có dữ liệu để xuất." }); return; }
    const csvContent = buildEntityCSV(selectedEntity, filteredData);
    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entityConfig[selectedEntity].name}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filteredData, selectedEntity]);

  // Backup all
  const backupAllData = useCallback(async () => {
    setIsBackingUp(true);
    setMessage({ type: "", text: "" });
    try {
      const files: { name: string; data: Uint8Array | string }[] = [];
      const backup: any = { version: 2, generated_at: new Date().toISOString(), entities: {} };
      for (const [key, cfg] of Object.entries(entityConfig)) {
        let records: any[] = [];
        if (key === "AssetTransaction") {
          const res = await callAssetFunc({ action: "list_range", start: "1900-01-01", end: "2100-12-31", include_deleted: true });
          records = Array.isArray(res.data) ? res.data : [];
        } else {
          const { data, error } = await supabase.from(cfg.table).select("*");
          if (error) throw error;
          records = data || [];
        }
        const fieldKeys = (cfg.fields || []).map(f => f.key);
        const sanitized = (records || []).map(r => {
          const obj: any = {};
          fieldKeys.forEach(k => { obj[k] = r?.[k] ?? null; });
          return obj;
        });
        const jsonStr = JSON.stringify(sanitized, null, 2);
        files.push({ name: `entities/${key}.json`, data: jsonStr });
        const csvStr = buildEntityCSV(key, records || []);
        files.push({ name: `entities/${key}.csv`, data: csvStr });
        backup.entities[key] = { name: cfg.name, schema: null, count: sanitized.length, records: sanitized };
      }
      files.push({ name: `backup/all_entities.json`, data: JSON.stringify(backup, null, 2) });
      const zipBlob = buildZip(files);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Backup_All_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"").slice(0,14)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage({ type: "success", text: "Đã tạo ZIP backup (JSON + CSV từng bảng và all_entities.json)!" });
    } catch (e: any) {
      console.error(e);
      setMessage({ type: "error", text: e?.message || "Có lỗi khi backup dữ liệu." });
    } finally { setIsBackingUp(false); }
  }, []);

  // Restore backup
  const handleRestoreBackup = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    setRestoreProgress(0);
    setMessage({ type: "", text: "" });
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const chunkArray = (arr: any[], size: number) => {
        const out: any[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };
      if (parsed && parsed.entities && typeof parsed.entities === "object") {
        const entities = parsed.entities;
        const allKeys = Object.keys(entities).filter(k => entityConfig[k]);
        const totalToInsert = allKeys.reduce((acc, k) => acc + ((entities[k].records || []).length), 0) || 1;
        let done = 0;
        for (const key of allKeys) {
          const cfg = entityConfig[key];
          const records = entities[key].records || [];
          const chunks = chunkArray(records, 200);
          for (const batch of chunks) {
            if (key === "AssetTransaction") {
              const nowIso = new Date().toISOString();
              const txs = batch.map((r: any) => ({
                transaction_date: r.transaction_date,
                parts_day: r.parts_day,
                room: r.room,
                transaction_type: r.transaction_type,
                asset_year: Number(r.asset_year),
                asset_code: Number(r.asset_code),
                note: r.note ?? null,
                notified_at: nowIso,
              }));
              await callAssetFunc({
                action: "create",
                staff_username: currentStaff?.username || "admin",
                staff_email: currentStaff?.email || null,
                staff_name: currentStaff?.staff_name || null,
                transactions: txs,
              });
            } else {
              const { error } = await supabase.from(cfg.table).insert(batch);
              if (error) throw error;
            }
            done += batch.length;
            setRestoreProgress(Math.min(100, Math.round((done / totalToInsert) * 100)));
            await sleep(50);
          }
        }
        setMessage({ type: "success", text: "Khôi phục từ backup JSON hoàn tất!" });
        if (selectedEntity) loadData();
      } else if (Array.isArray(parsed)) {
        if (!selectedEntity || !entityConfig[selectedEntity]) {
          setMessage({ type: "error", text: "Vui lòng chọn bảng để khôi phục JSON của một bảng." });
          return;
        }
        const cfg = entityConfig[selectedEntity];
        const chunks = chunkArray(parsed, 200);
        let done = 0;
        const total = parsed.length || 1;
        for (const batch of chunks) {
          if (selectedEntity === "AssetTransaction") {
            const nowIso = new Date().toISOString();
            const txs = batch.map((r: any) => ({
              transaction_date: r.transaction_date,
              parts_day: r.parts_day,
              room: r.room,
              transaction_type: r.transaction_type,
              asset_year: Number(r.asset_year),
              asset_code: Number(r.asset_code),
              note: r.note ?? null,
              notified_at: nowIso,
            }));
            await callAssetFunc({
              action: "create",
              staff_username: currentStaff?.username || "admin",
              staff_email: currentStaff?.email || null,
              staff_name: currentStaff?.staff_name || null,
              transactions: txs,
            });
          } else {
            const { error } = await supabase.from(cfg.table).insert(batch);
            if (error) throw error;
          }
          done += batch.length;
          setRestoreProgress(Math.min(100, Math.round((done / total) * 100)));
          await sleep(50);
        }
        await loadData();
        setMessage({ type: "success", text: `Khôi phục JSON cho bảng ${cfg.name} thành công!` });
      } else {
        setMessage({ type: "error", text: "Định dạng backup không hợp lệ." });
      }
    } catch (e: any) {
      console.error(e);
      setMessage({ type: "error", text: e?.message || "Có lỗi khi khôi phục backup." });
    } finally {
      setIsRestoring(false);
      setTimeout(() => { if (event?.target) event.target.value = ""; }, 0);
    }
  }, [selectedEntity, loadData, currentStaff]);

  // Delete logs per local settings (Overview)
  const deleteAllLogsCore = useCallback(async () => {
    setDeleteStatusText("Đang tải cài đặt tự động...");
    const savedSettings = autoDeleteSettings;
    const enabledEntities = Object.keys(savedSettings).filter(k => savedSettings[k]?.enabled && entityConfig[k]).map(k => ({ key: k, intervalDays: parseInt(savedSettings[k].interval || "90", 10) }));
    if (enabledEntities.length === 0) return { deleted: 0 };
    setDeleteStatusText("Đang quét dữ liệu cần xóa...");
    let overallTotal = 0;
    const targets: { key: string; ids: string[] }[] = [];
    for (const { key, intervalDays } of enabledEntities) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - intervalDays);
      let list: any[] = [];
      if (key === "AssetTransaction") {
        const res = await callAssetFunc({ action: "list_range", start: "1900-01-01", end: "2100-12-31", include_deleted: true });
        list = Array.isArray(res.data) ? res.data : [];
      } else {
        const { data } = await supabase.from(entityConfig[key].table).select("*");
        list = data || [];
      }
      // pick date field
      const dateField = key === "AssetTransaction" ? "transaction_date" : key === "TakenAssetStatus" ? "marked_at" : key === "Notification" ? "created_at" : key === "EmailUser" ? "updated_date" : key === "ProcessedNote" ? "created_date" : "created_date";
      const ids = (list || []).filter((it: any) => {
        const val = it?.[dateField] ?? it?.created_date;
        if (!val) return false;
        const t = new Date(val).getTime();
        return !isNaN(t) && t < cutoff.getTime();
      }).map((it: any) => it.id).filter(Boolean);
      overallTotal += ids.length;
      targets.push({ key, ids });
      await sleep(5);
    }
    if (overallTotal === 0) {
      setDeleteProgress(100);
      setDeleteStatusText("Không có dữ liệu cần xóa theo cài đặt.");
      return { deleted: 0 };
    }
    let done = 0;
    for (const { key, ids } of targets) {
      if (!ids.length) continue;
      setDeleteStatusText(`Đang xóa: ${entityConfig[key].name} (${ids.length} bản ghi)`);
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
      for (const batch of chunks) {
        for (const id of batch) {
          if (key === "AssetTransaction") await callAssetFunc({ action: "hard_delete_transaction", id });
          else await supabase.from(entityConfig[key].table).delete().eq("id", id);
          done += 1;
          setDeleteProgress(Math.min(99, Math.round((done / overallTotal) * 100)));
          await sleep(20);
        }
        await sleep(150);
      }
    }
    setDeleteProgress(100);
    setDeleteStatusText("Đã xóa xong theo cài đặt!");
    return { deleted: overallTotal };
  }, [autoDeleteSettings]);

  const handleDeleteAllLog = useCallback(async () => {
    setIsDeletingLogs(true);
    setDeleteProgress(0);
    setDeleteStatusText("Bắt đầu xóa theo cài đặt...");
    try {
      const res = await deleteAllLogsCore();
      setMessage({ type: "success", text: `Hoàn tất xóa tự động. Đã xóa ${res.deleted} bản ghi.` });
      if (selectedEntity) loadData();
    } catch (e: any) {
      console.error(e);
      setMessage({ type: "error", text: e?.message || "Có lỗi khi xóa dữ liệu." });
    } finally {
      setIsDeletingLogs(false);
    }
  }, [deleteAllLogsCore, selectedEntity, loadData]);

  const handleDeleteAndBackupAll = useCallback(async () => {
    setIsComboProcessing(true);
    setMessage({ type: "", text: "" });
    try {
      setIsDeletingLogs(true);
      setDeleteProgress(0);
      setDeleteStatusText("Bắt đầu xóa theo cài đặt...");
      await deleteAllLogsCore();
      setIsDeletingLogs(false);
      await backupAllData();
      setMessage({ type: "success", text: "Đã xóa theo cài đặt và backup toàn bộ thành công!" });
    } catch (e: any) {
      console.error(e);
      setMessage({ type: "error", text: e?.message || "Có lỗi trong quá trình Delete & Backup ALL." });
    } finally {
      setIsDeletingLogs(false);
      setIsComboProcessing(false);
    }
  }, [deleteAllLogsCore, backupAllData]);

  // Overview counts
  const loadOverviewCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    for (const [key, cfg] of Object.entries(entityConfig)) {
      try {
        const { count } = await supabase.from(cfg.table).select("*", { count: "exact", head: true });
        counts[key] = count || 0;
      } catch { counts[key] = 0; }
    }
    setOverviewCounts(counts);
  }, []);
  const saveAutoDeleteSettings = useCallback(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(autoDeleteSettings));
      setMessage({ type: "success", text: "Đã lưu cài đặt tự động xóa vào thiết bị." });
    } catch { setMessage({ type: "error", text: "Không thể lưu cài đặt." }); }
  }, [autoDeleteSettings]);

  // Render helpers
  const renderFormField = useCallback((field: EntityField) => {
    const value = formData[field.key];
    switch (field.type) {
      case "select": {
        const selVal = value !== undefined && value !== null ? String(value) : "";
        return (
          <Select value={selVal} onValueChange={(val) => setFormData({ ...formData, [field.key]: val })}>
            <SelectTrigger className="h-10"><SelectValue placeholder={`Chọn ${field.label.toLowerCase()}`} /></SelectTrigger>
            <SelectContent>{(field.options || []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
          </Select>
        );
      }
      case "textarea": return <Textarea value={value || ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })} placeholder={`Nhập ${field.label.toLowerCase()}`} />;
      case "number": return <Input type="number" value={value !== undefined && value !== null ? value : ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value === "" ? "" : parseInt(e.target.value) || 0 })} />;
      case "date": return <Input type="date" value={value || ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })} />;
      case "datetime-local": return <Input type="datetime-local" value={value || ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })} />;
      case "password": return <Input type="password" value={value || ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })} />;
      case "json": return <Textarea rows={5} value={value || ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })} placeholder="Nhập JSON" />;
      default: return <Input type="text" value={value || ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })} />;
    }
  }, [formData]);

  const renderCellValue = useCallback((item: any, field: EntityField) => {
    const value = item?.[field.key];
    if ((field.type === "date" || field.type === "datetime-local") && value) {
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return field.type === "date" ? `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}` : `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
        }
      } catch {}
    }
    if (field.type === "select" && (value === true || value === false)) return value ? "Có" : "Không";
    if (field.type === "password") return "••••••••";
    if (field.type === "json") {
      try { return typeof value === "object" ? JSON.stringify(value) : String(value || "-"); } catch { return String(value || "-"); }
    }
    return value === null || value === undefined || value === "" ? "-" : String(value);
  }, []);

  if (!currentStaff) {
    return (
      <div className="p-4 md:p-8 text-center text-slate-500">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
        Đang tải thông tin người dùng...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <SonnerToaster />
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-gray-600 to-gray-700 rounded-xl flex items-center justify-center">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Quản lý dữ liệu</h1>
          <p className="text-slate-600">Hệ thống quản lý và backup dữ liệu toàn diện với các tính năng tự động hóa hiện đại</p>
        </div>
      </div>

      {message.text && (
        <Alert className={`mb-6 ${message.type === "success" ? "border-green-200 bg-green-50" : message.type === "info" ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
          {message.type === "success" ? <CheckIcon /> : message.type === "info" ? <InfoIcon /> : <AlertCircle className="h-4 w-4 text-red-600" />}
          <AlertDescription className={message.type === "success" ? "text-green-800" : message.type === "info" ? "text-blue-800" : "text-red-800"}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button variant={tab === "stats" ? "default" : "outline"} onClick={() => setTab("stats")} className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Thống kê
        </Button>
        <Button variant={tab === "data" ? "default" : "outline"} onClick={() => setTab("data")} className="flex items-center gap-2">
          <Users className="w-4 h-4" /> Quản lý dữ liệu
        </Button>
        <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")} className="flex items-center gap-2">
          <Database className="w-4 h-4" /> Tổng quan & Cài đặt
        </Button>
      </div>

      {tab === "stats" && (
        <div className="space-y-6">
          <div className="border rounded-lg shadow-sm">
            <div className="p-4 border-b bg-slate-50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="font-semibold">Tác vụ nhanh</div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleDeleteAllLog} variant="destructive" disabled={isDeletingLogs || isComboProcessing || isBackingUp} className="bg-red-600 hover:bg-red-700">
                    {isDeletingLogs && !isComboProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrashIcon className="w-4 h-4 mr-2" />}
                    Xóa log cũ
                  </Button>
                  <Button onClick={backupAllData} disabled={isBackingUp || isDeletingLogs || isComboProcessing} className="bg-purple-600 hover:bg-purple-700">
                    {isBackingUp && !isComboProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
                    Backup toàn bộ
                  </Button>
                  <Button onClick={handleDeleteAndBackupAll} disabled={isDeletingLogs || isBackingUp || isComboProcessing} className="bg-indigo-600 hover:bg-indigo-700">
                    {isComboProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
                    Xóa & Backup toàn bộ
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-4">
              {(isDeletingLogs || isComboProcessing || isRestoring || isBackingUp) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-600" />
                    <span className="text-sm text-slate-700">
                      {isRestoring ? `Đang khôi phục: ${restoreProgress}%` : (isDeletingLogs || isComboProcessing) ? deleteStatusText || "Đang xử lý..." : isBackingUp ? "Đang tạo backup..." : ""}
                    </span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${isRestoring ? restoreProgress : deleteProgress}%` }}></div>
                  </div>
                  <p className="text-xs text-slate-500">{isRestoring ? restoreProgress : deleteProgress}%</p>
                </div>
              )}
            </div>
          </div>
          {/* AdvancedStats có thể thêm sau nếu cần */}
        </div>
      )}

      {tab === "data" && (
        <div className="space-y-6">
          <div className="border rounded-lg shadow-sm">
            <div className="p-4 border-b bg-slate-50">
              <div className="flex flex-col gap-4">
                <div className="font-semibold">Chọn bảng dữ liệu</div>
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Select value={selectedEntity} onValueChange={handleEntityChange}>
                      <SelectTrigger className="min-w-[220px] h-10">
                        <SelectValue placeholder="Chọn bảng..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto z-50">
                        {Object.keys(entityConfig).map(key => (
                          <SelectItem key={key} value={key}>{entityConfig[key].name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedEntity ? (
                      <Button onClick={handleAdd} className="h-10 bg-green-600 hover:bg-green-700">
                        <Plus className="w-4 h-4 mr-2" /> Tạo mới
                      </Button>
                    ) : (
                      <>
                        <Button onClick={backupAllData} disabled={isBackingUp || isDeletingLogs || isComboProcessing} className="h-10 bg-purple-600 hover:bg-purple-700">
                          <Archive className="w-4 h-4 mr-2" /> {isBackingUp ? "Đang backup..." : "Backup All Data"}
                        </Button>
                        <Button onClick={() => backupFileInputRef.current?.click()} disabled={isRestoring || isDeletingLogs || isComboProcessing} variant="outline" className="h-10">
                          <Upload className="w-4 h-4 mr-2" /> {isRestoring ? `Đang khôi phục${restoreProgress ? ` ${restoreProgress}%` : ""}...` : "Khôi phục từ Backup"}
                        </Button>
                      </>
                    )}
                  </div>
                  {selectedEntity && (
                    <div className="flex items-center gap-2">
                      <Button onClick={exportToCSV} variant="outline" disabled={(filteredData?.length || 0) === 0}>
                        <Download className="w-4 h-4 mr-2" /> Xuất CSV
                      </Button>
                      <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="bg-blue-50 hover:bg-blue-100 text-blue-700">
                        <Upload className="w-4 h-4 mr-2" /> Nhập CSV
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {selectedEntity && (
              <div className="p-4">
                <div className="space-y-2">
                  <Label>Tìm kiếm trong bảng dữ liệu</Label>
                  <Input placeholder={`Tìm kiếm trong ${entityConfig[selectedEntity]?.name || ""}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-11" />
                </div>
              </div>
            )}
          </div>

          {isAdmin && selectedEntity === "AssetTransaction" && (
            <div className="border rounded-lg shadow-sm">
              <div className="p-4 border-b bg-red-50">
                <div className="font-semibold">Xóa hàng loạt (Admin)</div>
                <p className="text-sm text-slate-600">Chọn khoảng thời gian để xóa tất cả các giao dịch trong khoảng đó. Hành động này không thể hoàn tác.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date_delete">Ngày bắt đầu</Label>
                  <Input id="start_date_delete" type="date" value={deleteDateRange.start} onChange={(e) => setDeleteDateRange({ ...deleteDateRange, start: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date_delete">Ngày kết thúc</Label>
                  <Input id="end_date_delete" type="date" value={deleteDateRange.end} onChange={(e) => setDeleteDateRange({ ...deleteDateRange, end: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleBulkDelete} variant="destructive" disabled={isLoading || !deleteDateRange.start || !deleteDateRange.end} className="h-11">
                    <TrashIcon className="w-4 h-4 mr-2" /> {isLoading ? "Đang xóa..." : "Xóa theo ngày"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {selectedEntity && (
            <div className="border rounded-lg shadow-sm">
              <div className="p-4 border-b bg-slate-50">
                <div className="text-lg font-semibold">
                  {entityConfig[selectedEntity]?.name || selectedEntity}
                  {searchTerm || Object.values(columnFilters).some(v => v)
                    ? ` - Kết quả lọc: ${sortedFilteredData?.length || 0}`
                    : ` (Tổng: ${data?.length || 0} bản ghi)`}
                </div>
                {(searchTerm || Object.values(columnFilters).some(v => v)) && (
                  <div className="text-sm text-slate-600 mt-2">
                    {searchTerm && `Tìm kiếm chung: "${searchTerm}"`}
                    {Object.entries(columnFilters).filter(([,v]) => v).map(([k, v]) => {
                      const field = entityConfig[selectedEntity]?.fields.find(f => f.key === k);
                      return field ? ` | Lọc theo "${field.label}": "${v}"` : "";
                    }).join("")}
                  </div>
                )}
              </div>
              <div className="p-4">
                {/* Column chooser */}
                <div className="mb-3">
                  <div className="text-sm font-medium mb-2">Chọn cột hiển thị</div>
                  <div className="flex flex-wrap gap-2">
                    {(entityConfig[selectedEntity]?.fields || []).map(f => (
                      <label key={f.key} className="inline-flex items-center gap-2 px-2 py-1 border rounded-md text-sm">
                        <input type="checkbox" checked={visibleColumns.includes(f.key)} onChange={() => toggleVisibleColumn(f.key)} />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <div className="p-12 text-center">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                    <p>Đang tải...</p>
                  </div>
                ) : (sortedFilteredData?.length || 0) === 0 ? (
                  <div className="p-12 text-center">
                    <p>{searchTerm || Object.values(columnFilters).some(v => v) ? "Không tìm thấy kết quả phù hợp" : "Chưa có dữ liệu"}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          {visibleColumns.map(colKey => {
                            const field = entityConfig[selectedEntity].fields.find(f => f.key === colKey)!;
                            return (
                              <th key={colKey} className="py-2 px-3">
                                <button className="flex items-center gap-1 hover:underline text-left" onClick={() => {
                                  if (sortKey === colKey) setSortDirection(prev => prev === "asc" ? "desc" : "asc");
                                  else { setSortKey(colKey); setSortDirection("asc"); }
                                }}>
                                  <span>{field.label}</span>
                                  {sortKey === colKey && (sortDirection === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                                </button>
                              </th>
                            );
                          })}
                          <th className="py-2 px-3">Thao tác</th>
                        </tr>
                        <tr className="text-left border-b">
                          {visibleColumns.map(colKey => {
                            const field = entityConfig[selectedEntity].fields.find(f => f.key === colKey)!;
                            return (
                              <th key={`${colKey}-filter`} className="py-2 px-3">
                                {field.type === "select" && Array.isArray(field.options) ? (
                                  <Select value={columnFilters[colKey] || "all"} onValueChange={(v) => setColumnFilters(prev => ({ ...prev, [colKey]: v === "all" ? "" : v }))}>
                                    <SelectTrigger className="h-9"><SelectValue placeholder="Tất cả" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">Tất cả</SelectItem>
                                      {field.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input className="h-9" placeholder="Lọc..." value={columnFilters[colKey] || ""} onChange={(e) => setColumnFilters(prev => ({ ...prev, [colKey]: e.target.value }))} />
                                )}
                              </th>
                            );
                          })}
                          <th className="py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentTableData.map(item => (
                          <tr key={item?.id || Math.random()} className="border-b">
                            {visibleColumns.map(colKey => {
                              const field = entityConfig[selectedEntity].fields.find(f => f.key === colKey)!;
                              return (
                                <td key={`${item?.id || Math.random()}-${colKey}`} className="py-2 px-3">
                                  {renderCellValue(item, field)}
                                </td>
                              );
                            })}
                            <td className="py-2 px-3">
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-700">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {selectedEntity === "Staff" && isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleAccountStatus(item)}
                                    className={item.account_status === "locked" ? "text-green-600 hover:text-green-700" : "text-orange-600 hover:text-orange-700"}
                                    title={item.account_status === "locked" ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                                  >
                                    {item.account_status === "locked" ? <Lock className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-700">
                                  <TrashIcon className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="p-4 flex justify-end">
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Trang trước</Button>
                  <span className="text-sm">Trang {currentPage}/{Math.max(1, totalPages)}</span>
                  <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Trang sau</Button>
                </div>
              </div>
            </div>
          )}

          {/* Dialog create/update */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingItem ? "Chỉnh sửa" : "Thêm mới"} {selectedEntity && entityConfig[selectedEntity]?.name}</DialogTitle>
              </DialogHeader>
              {selectedEntity && entityConfig[selectedEntity] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 max-h-96 overflow-y-auto">
                  {entityConfig[selectedEntity].fields.map(field => (
                    <div key={field.key} className={field.type === "textarea" || field.type === "password" || field.type === "datetime-local" || field.type === "json" ? "md:col-span-2 space-y-2" : "space-y-2"}>
                      <Label>{field.label}</Label>
                      {renderFormField(field)}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Hủy</Button>
                <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">{editingItem ? "Cập nhật" : "Thêm mới"}</Button>
              </div>
            </DialogContent>
          </Dialog>

          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
          <input ref={backupFileInputRef} type="file" accept="application/json,.json" onChange={handleRestoreBackup} className="hidden" />
        </div>
      )}

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="border rounded-lg shadow-sm">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <div className="font-semibold">Tổng quan Database & Cài đặt tự động</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={loadOverviewCounts}>Tải dữ liệu tất cả</Button>
                <Button onClick={saveAutoDeleteSettings} className="bg-black text-white">Lưu cài đặt</Button>
              </div>
            </div>
            <div className="p-4">
              <div className="mb-3 p-3 rounded-md border bg-amber-50 text-amber-900 text-sm">
                Cảnh báo: Tính năng tự động xóa sẽ xóa dữ liệu cũ theo lịch. Dữ liệu đã xóa không thể khôi phục. Lưu ý: Cài đặt này được lưu tại trình duyệt của bạn.
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-3">Bảng dữ liệu</th>
                    <th className="py-2 px-3">Số bản ghi</th>
                    <th className="py-2 px-3">Tự động xóa</th>
                    <th className="py-2 px-3">Khoảng thời gian (ngày)</th>
                    <th className="py-2 px-3">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(entityConfig).map(key => {
                    const name = entityConfig[key].name;
                    const settings = autoDeleteSettings[key] || { enabled: false, interval: "90" };
                    return (
                      <tr key={key} className="border-b">
                        <td className="py-2 px-3">{name}</td>
                        <td className="py-2 px-3">{overviewCounts[key] ?? "-"}</td>
                        <td className="py-2 px-3">
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={settings.enabled} onChange={(e) => setAutoDeleteSettings(prev => ({ ...prev, [key]: { ...settings, enabled: e.target.checked } }))} />
                            Bật
                          </label>
                        </td>
                        <td className="py-2 px-3">
                          <Select value={settings.interval} onValueChange={(v) => setAutoDeleteSettings(prev => ({ ...prev, [key]: { ...settings, interval: v } }))}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Chọn..." /></SelectTrigger>
                            <SelectContent>
                              {["7","15","30","60","90","180","365"].map(d => <SelectItem key={d} value={d}>{d} ngày</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={async () => {
                              const cfg = entityConfig[key];
                              const { data, error } = await supabase.from(cfg.table).select("*");
                              if (error) { toast.error("Không thể tải dữ liệu"); return; }
                              const csv = buildEntityCSV(key, data || []);
                              const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url; a.download = `${cfg.name}_${new Date().toISOString().slice(0,10)}.csv`;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }}>
                              <Download className="w-4 h-4 mr-2" /> Xuất CSV
                            </Button>
                            <Button variant="destructive" onClick={async () => {
                              if (!confirm(`Xóa dữ liệu cũ của ${name} theo cài đặt hiện tại?`)) return;
                              setIsDeletingLogs(true); setDeleteProgress(0); setDeleteStatusText("Đang xóa dữ liệu cũ...");
                              await deleteAllLogsCore();
                              setIsDeletingLogs(false);
                            }}>
                              <TrashIcon className="w-4 h-4 mr-2" /> Xóa dữ liệu cũ
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small inline icons for Alerts
function CheckIcon() { return <svg className="h-4 w-4 text-green-600" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function InfoIcon() { return <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 8h.01M11 12h2v4h-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }