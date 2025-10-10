"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Download, Search } from "lucide-react";
import { format } from "date-fns";

type Mode = "inStock" | "exported";

type InFilters = { depositStart: string; depositEnd: string; depositor: string };
type OutFilters = { withdrawStart: string; withdrawEnd: string; withdrawPerson: string };

type Props = {
  mode: Mode;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  filters: InFilters | OutFilters;
  onFiltersChange: (v: InFilters | OutFilters) => void;
  sortKey: string;
  sortDirection: "asc" | "desc";
  onSortKeyChange: (v: string) => void;
  onSortDirectionChange: (v: "asc" | "desc") => void;
  onExportCSV: () => void;
  isLoading?: boolean;
};

const OtherAssetFilters: React.FC<Props> = ({
  mode,
  searchTerm,
  onSearchChange,
  filters,
  onFiltersChange,
  sortKey,
  sortDirection,
  onSortKeyChange,
  onSortDirectionChange,
  onExportCSV,
  isLoading,
}) => {
  const isIn = mode === "inStock";

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 items-stretch">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo tên TS, người gửi/nhận..."
            className="pl-9 h-11"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-40">
            <Label className="sr-only">Sắp xếp</Label>
            <Select value={sortKey} onValueChange={onSortKeyChange}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Sắp xếp" />
              </SelectTrigger>
              <SelectContent>
                {isIn ? (
                  <>
                    <SelectItem value="deposit_date">Ngày gửi</SelectItem>
                    <SelectItem value="name">Tên</SelectItem>
                    <SelectItem value="depositor">Người gửi</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="withdrawal_date">Ngày xuất</SelectItem>
                    <SelectItem value="name">Tên</SelectItem>
                    <SelectItem value="withdrawal_deliverer">Người giao (xuất)</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label className="sr-only">Chiều</Label>
            <Select value={sortDirection} onValueChange={(v) => onSortDirectionChange(v as "asc" | "desc")}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Chiều" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Tăng dần</SelectItem>
                <SelectItem value="desc">Giảm dần</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onExportCSV} variant="outline" disabled={isLoading} className="h-11">
            <Download className="h-4 w-4 mr-2" /> Xuất CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>{isIn ? "Khoảng ngày gửi" : "Khoảng ngày xuất"}</Label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-11 w-full justify-start">
                  <CalendarIcon className="h-4 w-4 mr-2" /> {(() => {
                    const start = isIn ? (filters as InFilters).depositStart : (filters as OutFilters).withdrawStart;
                    return start ? format(new Date(start), "dd/MM/yyyy") : "Từ ngày";
                  })()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={(() => {
                    const v = isIn ? (filters as InFilters).depositStart : (filters as OutFilters).withdrawStart;
                    return v ? new Date(v) : undefined;
                  })()}
                  onSelect={(date) => {
                    if (!date) return;
                    const iso = format(date, "yyyy-MM-dd");
                    const next = { ...(filters as any) };
                    if (isIn) next.depositStart = iso; else next.withdrawStart = iso;
                    onFiltersChange(next);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-11 w-full justify-start">
                  <CalendarIcon className="h-4 w-4 mr-2" /> {(() => {
                    const end = isIn ? (filters as InFilters).depositEnd : (filters as OutFilters).withdrawEnd;
                    return end ? format(new Date(end), "dd/MM/yyyy") : "Đến ngày";
                  })()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={(() => {
                    const v = isIn ? (filters as InFilters).depositEnd : (filters as OutFilters).withdrawEnd;
                    return v ? new Date(v) : undefined;
                  })()}
                  onSelect={(date) => {
                    if (!date) return;
                    const iso = format(date, "yyyy-MM-dd");
                    const next = { ...(filters as any) };
                    if (isIn) next.depositEnd = iso; else next.withdrawEnd = iso;
                    onFiltersChange(next);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>{isIn ? "Người gửi/nhận (gửi)" : "Người giao/nhận (xuất)"}</Label>
          <Input
            value={isIn ? (filters as InFilters).depositor : (filters as OutFilters).withdrawPerson}
            onChange={(e) => {
              const next = { ...(filters as any) };
              if (isIn) next.depositor = e.target.value; else next.withdrawPerson = e.target.value;
              onFiltersChange(next);
            }}
            placeholder={isIn ? "Lọc theo người gửi" : "Lọc theo người giao/nhận"}
            className="h-11"
          />
        </div>
      </div>
    </div>
  );
};

export default OtherAssetFilters;