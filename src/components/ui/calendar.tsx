"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      // khung ngoài
      className={cn("p-3", className)}
      classNames={{
        // v9: wrapper quanh các month
        root: "space-y-3",
        months: "flex flex-col sm:flex-row gap-3 sm:gap-4",
        month: "space-y-3",
        caption: "flex justify-center items-center relative pt-1",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",

        // HEADER: các thứ trong tuần
        // v9 dùng weekdays / weekday
        weekdays: "grid grid-cols-7 gap-0",
        weekday:
          "flex items-center justify-center text-[0.8rem] font-normal text-muted-foreground",

        // BODY: các tuần & ngày
        // v9 dùng weeks / week / day / day_button
        weeks: "space-y-1",
        week: "grid grid-cols-7 gap-0",
        day: "relative flex items-center justify-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100"
        ),

        // các state cho day_button
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",

        // cho phép caller override thêm
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...iconProps }: any) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...iconProps} />
        ),
        IconRight: ({ className, ...iconProps }: any) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...iconProps} />
        ),
      } as any}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"

export { Calendar }