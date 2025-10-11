"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Plus, Minus } from "lucide-react";

type Props = {
  index: number;
  value: string;
  isValid: boolean;
  onChange: (index: number, value: string) => void;
  onAddRow: () => void;
  onRemoveRow?: (index: number) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
  onTabNavigate?: (index: number, direction: "next" | "prev") => void;
  showRemove: boolean;
  onFirstType?: (index: number) => void;
  autoFocus?: boolean;
  enterKeyHint?: "next" | "done";
  isLast?: boolean;
  onPasteText?: (index: number, text: string) => boolean;
};

const AssetCodeInputRow: React.FC<Props> = React.memo(
  ({ index, value, isValid, onChange, onAddRow, onRemoveRow, inputRef, onTabNavigate, showRemove, onFirstType, autoFocus, enterKeyHint, isLast, onPasteText }) => {
    const localInputRef = React.useRef<HTMLInputElement | null>(null);
    
    // Auto focus when requested
    React.useEffect(() => {
      if (!autoFocus) return;
      const el = localInputRef.current;
      if (!el) return;
      const tryFocus = (opts?: FocusOptions) => {
        try { el.focus(opts as any); } catch {}
        try { el.click?.(); } catch {}
        try { const v = el.value ?? ""; el.setSelectionRange?.(v.length, v.length); } catch {}
      };
      tryFocus({ preventScroll: true });
      requestAnimationFrame(() => tryFocus({ preventScroll: true }));
      const t = setTimeout(() => tryFocus({ preventScroll: true }), 200);
      return () => clearTimeout(t);
    }, [autoFocus]);

    return (
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            inputMode="decimal"
            lang="en-US"
            pattern="[0-9.,]*"
            autoComplete="off"
            autoCorrect="off"
            autoFocus={autoFocus}
            enterKeyHint={enterKeyHint}
            value={value}
            onChange={(e) => onChange(index, e.target.value)}
            ref={(el) => {
              localInputRef.current = el;
              inputRef?.(el || null);
            }}
            onBeforeInput={() => {
              if (!value) onFirstType?.(index);
            }}
            onKeyDown={(e) => {
              if (!value && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
                onFirstType?.(index);
              }
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                onTabNavigate?.(index, "next");
              } else if (e.key === "Tab" && e.shiftKey) {
                e.preventDefault();
                onTabNavigate?.(index, "prev");
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (enterKeyHint === "next" && !isLast) {
                  onTabNavigate?.(index, "next");
                } else {
                  localInputRef.current?.blur();
                }
              } else if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                onTabNavigate?.(index, "prev");
              }
            }}
            onPaste={(e) => {
              const txt = e.clipboardData?.getData("text") ?? "";
              const handled = onPasteText ? onPasteText(index, txt) : false;
              if (handled) {
                e.preventDefault();
                onFirstType?.(index);
              } else {
                if (!value) onFirstType?.(index);
              }
            }}
            placeholder="Ví dụ: 259.24"
            className={`h-10 pr-9 font-mono text-center text-lg font-semibold ${value ? (isValid ? "border-green-300" : "border-red-300") : ""}`}
          />
          {value && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {isValid ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
            </div>
          )}
        </div>
        <Button
          type="button"
          onClick={onAddRow}
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full border-2 border-green-600 text-green-800 hover:bg-green-100"
          aria-label="Thêm dòng"
        >
          <Plus className="w-4 h-4" />
        </Button>
        {showRemove && onRemoveRow && (
          <Button
            type="button"
            onClick={() => onRemoveRow(index)}
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full border-2 border-red-500 text-red-500 hover:bg-red-100"
            aria-label="Xóa dòng"
          >
            <Minus className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }
);

AssetCodeInputRow.displayName = "AssetCodeInputRow";
export default AssetCodeInputRow;