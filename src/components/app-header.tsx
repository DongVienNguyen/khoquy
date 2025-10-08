"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Package,
  ChevronDown,
  Bell,
  FileText,
  Clock,
  Timer,
  ClipboardCheck,
  BarChart3,
  Archive,
  Database,
  Bug,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type SafeStaff = {
  username?: string;
  staff_name?: string;
};

function useUserInitial() {
  const [initial, setInitial] = React.useState<string>("U");
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("loggedInStaff");
      if (raw) {
        const staff = JSON.parse(raw) as SafeStaff;
        const name = (staff.staff_name || staff.username || "").trim();
        const letter = name ? name.charAt(0).toUpperCase() : "U";
        setInitial(letter);
      }
    } catch {
      setInitial("U");
    }
  }, []);
  return initial;
}

const AppHeader: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const initial = useUserInitial();

  // Ẩn header ở trang đăng nhập
  if (pathname === "/sign-in") return null;

  const go = (href: string) => router.push(href);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/daily-report"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-green-700 text-white shadow"
            aria-label="Trang chủ báo cáo"
          >
            <Package className="h-5 w-5" />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                Menu
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Điều hướng</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => go("/asset-entry")}>
                <Package className="mr-2" /> Thông báo Mượn/Xuất
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => go("/daily-report")}>
                <FileText className="mr-2" /> Danh sách TS cần lấy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Timer className="mr-2" /> Theo dõi TS gửi tạm
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Clock className="mr-2" /> Nhắc tài sản đến hạn
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <ClipboardCheck className="mr-2" /> Nhắc duyệt CRC
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <BarChart3 className="mr-2" /> Báo cáo TS đã mượn
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Archive className="mr-2" /> Tài sản khác gửi kho
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Database className="mr-2" /> Quản lý dữ liệu
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Bug className="mr-2" /> Báo lỗi ứng dụng
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Thông báo">
            <Bell className="h-5 w-5" />
          </Button>
          <Avatar className="h-9 w-9 ring-2 ring-green-600/20">
            <AvatarFallback className="bg-green-700 text-white font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;