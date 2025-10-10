"use client";

import React, { useMemo, useState, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
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

  const normalize = (s: string) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const filtered = useMemo(() => {
    const q = normalize(value || "");
    if (!q) return [];
    return (suggestions || [])
      .filter((s) => normalize(s).includes(q))
      .slice(0, 10);
  }, [value, suggestions]);

  useImperativeHandle(ref, () => ({
    focus() {
      const el = (id ? document.getElementById(id) : null) as HTMLInputElement | null;
      el?.focus();
    },
  }) as unknown as HTMLDivElement);

  return (
    <div data-autocomplete-root data-open={open ? "true" : "false"} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          setOpen(Boolean(next.trim()));
          setHighlight(-1);
        }}
        onFocus={() => {
          if ((value || "").trim()) setOpen(true);
        }}
        onBlur={() => {
          // đóng nhẹ nhàng khi blur ra ngoài
          setTimeout(() => setOpen(false), 120);
        }}
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
            const pick = filtered[highlight >= 0 ? highlight : 0];
            if (pick) {
              e.preventDefault();
              onChange(pick);
              if (e.key === "Enter") setOpen(false);
            }
          }
        }}
        placeholder={placeholder}
        className={cn("h-10", className)}
        autoComplete="off"
        spellCheck={false}
      />

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md">
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
        </div>
      )}
    </div>
  );
});

AutoCompleteInput.displayName = "AutoCompleteInput";
export default AutoCompleteInput;