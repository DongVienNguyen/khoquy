"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type DatePickerLazyProps = {
  selected: Date | null;
  minDate: Date;
  onSelect: (date: Date) => void;
  formatDateShort: (date: Date | null) => string;
};

const DatePickerLazy: React.FC<DatePickerLazyProps> = ({
  selected,
  minDate,
  onSelect,
  formatDateShort,
}) => {
  const [open, setOpen] = React.useState<boolean>(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 w-full justify-center">
          {formatDateShort(selected)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-0">
        <Calendar
          mode="single"
          selected={selected || undefined}
          onSelect={(date) => {
            if (date) {
              onSelect(date);
              setOpen(false);
            }
          }}
          disabled={(date) => !!date && date < minDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
};

export default DatePickerLazy;