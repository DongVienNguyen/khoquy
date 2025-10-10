"use client";

import React, { useMemo, useState, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  stayAfterTabSelect?: boolean;
};

const AutoCompleteInput = React.forwardRef<HTMLDivElement, Props>((props, ref) => {
  const { id, value, onChange, suggestions, placeholder, className, stayAfterTabSelect } = props;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);

  const filtered = useMemo(() => {
    const q = (value || "").toLowerCase();
    return (suggestions || []).filter((s) => s.toLowerCase().includes(q)).slice(0, 10);
  }, [value, suggestions]);

  useImperativeHandle(ref, () => ({
    focus() {
      const el = (id ? document.getElementById(id) : null) as HTMLInputElement | null;
      el?.focus();
    },
  }) as unknown as HTMLDivElement);

  return (
    <div data-autocomplete-root data-open={open ? "true" : "false"} className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Input
            id={id}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
              setHighlight(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                return;
              }
              if (!open) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(filtered.length - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter" || (e.key === "Tab" && stayAfterTabSelect)) {
                if (highlight >= 0 && filtered[highlight]) {
                  e.preventDefault();
                  onChange(filtered[highlight]);
                }
              }
            }}
            placeholder={placeholder}
            className={cn("h-10", className)}
          />
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
          <div className="max-h-44 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Không có gợi ý</div>
            ) : (
              filtered.map((s, idx) => (
                <button
                  key={`${s}-${idx}`}
                  className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent", idx === highlight && "bg-accent")}
                  onMouseEnter={() => setHighlight(idx)}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // tránh blur Input trước khi xử lý
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  {s}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

AutoCompleteInput.displayName = "AutoCompleteInput";
export default AutoCompleteInput;