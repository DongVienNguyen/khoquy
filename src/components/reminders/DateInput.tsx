"use client";

import React, { useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
};

function normalizeDdMm(v: string): string {
  const digits = v.replace(/[^\d-]/g, "");
  const parts = digits.split("-");
  const dd = (parts[0] || "").padStart(2, "0").slice(0, 2);
  const mm = (parts[1] || "").padStart(2, "0").slice(0, 2);
  return dd && mm ? `${dd}-${mm}` : `${dd}${mm ? "-" + mm : ""}`;
}

const DateInput = React.forwardRef<HTMLDivElement, Props>(({ id, value, onChange, className }, ref) => {
  useImperativeHandle(ref, () => ({
    focus() {
      const el = (id ? document.getElementById(id) : null) as HTMLInputElement | null;
      el?.focus();
    },
  }) as unknown as HTMLDivElement);

  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onChange(normalizeDdMm(value))}
      placeholder="dd-MM"
      className={className || "h-10"}
      inputMode="numeric"
      autoComplete="off"
    />
  );
});

DateInput.displayName = "DateInput";
export default DateInput;