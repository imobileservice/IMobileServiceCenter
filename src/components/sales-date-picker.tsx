"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import * as Popover from "@radix-ui/react-popover"
import { DayPicker, type DayButtonProps } from "react-day-picker"
import { addDays, format, isSameDay, isToday, isYesterday, startOfMonth, endOfMonth } from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { inventorySalesService } from "@/lib/services/inventory.service"
import { formatCurrency } from "@/lib/utils/currency"
import { cn } from "@/lib/utils"

type DayStat = { count: number; total: number }

/** Local calendar day a timestamp falls on, as yyyy-MM-dd. */
const dayKey = (date: Date) => format(date, "yyyy-MM-dd")

/**
 * The whole of one local day as ISO timestamps, for from_date / to_date.
 *
 * Built from the browser's own midnight rather than a bare "2026-11-14", which
 * the database would read as UTC midnight and so cut 5½ hours off a Sri Lankan
 * day at each end.
 */
export function dayRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  return { from_date: start.toISOString(), to_date: end.toISOString() }
}

/** "Today", "Yesterday" or "Fri, 14 Nov 2026". */
export function describeDay(date: Date) {
  if (isToday(date)) return `Today · ${format(date, "d MMM yyyy")}`
  if (isYesterday(date)) return `Yesterday · ${format(date, "d MMM yyyy")}`
  return format(date, "EEE, d MMM yyyy")
}

const DayStatsContext = createContext<Map<string, DayStat>>(new Map())

/** A calendar day, with a dot under it when something was sold that day. */
function SalesDayButton({ day, modifiers, children, ...buttonProps }: DayButtonProps) {
  const stat = useContext(DayStatsContext).get(dayKey(day.date))
  const ref = useRef<HTMLButtonElement>(null)

  // Keyboard navigation moves focus between days; the stock button does this too.
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <button
      ref={ref}
      {...buttonProps}
      title={stat ? `${stat.count} sale${stat.count === 1 ? "" : "s"} · ${formatCurrency(stat.total)}` : buttonProps.title}
    >
      <span className="leading-none">{children}</span>
      <span
        className={cn(
          "mt-1 h-1 w-1 rounded-full",
          stat ? (modifiers.selected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent"
        )}
      />
    </button>
  )
}

/**
 * Pick one day of sales: a calendar that marks the days something was sold,
 * with previous / next day arrows beside it for stepping through a week.
 *
 * `shop` and `createdBy` only steer the dots, so they match the list the page
 * shows; the page itself still does the filtering.
 */
export default function SalesDatePicker({
  value,
  onChange,
  shop,
  createdBy,
  clearLabel,
  className,
}: {
  value: Date | null
  onChange: (date: Date | null) => void
  shop?: string
  createdBy?: string
  /** Show a clear button, and this text when no day is picked (e.g. "All dates"). */
  clearLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<Date>(value || new Date())
  const [stats, setStats] = useState<Map<string, DayStat>>(new Map())
  const [loadingStats, setLoadingStats] = useState(false)

  const today = new Date()
  const canStepForward = Boolean(value) && !isToday(value as Date) && (value as Date) < today

  // Open on the picked day's month, not wherever the calendar was left.
  useEffect(() => {
    if (open) setMonth(value || new Date())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load the dots for the month on screen whenever the calendar is open.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingStats(true)
    inventorySalesService
      .getSaleDays({
        from_date: startOfMonth(month).toISOString(),
        to_date: endOfMonth(month).toISOString(),
        shop,
        created_by: createdBy,
      })
      .then((res) => {
        if (cancelled) return
        const next = new Map<string, DayStat>()
        for (const sale of res.data || []) {
          const key = dayKey(new Date(sale.created_at))
          const stat = next.get(key) || { count: 0, total: 0 }
          stat.count += 1
          stat.total += Number(sale.net_amount || 0)
          next.set(key, stat)
        }
        setStats(next)
      })
      .catch(() => {
        // The calendar still works without its dots.
        if (!cancelled) setStats(new Map())
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, month, shop, createdBy])

  const monthTotals = Array.from(stats.values()).reduce(
    (sum, stat) => ({ count: sum.count + stat.count, total: sum.total + stat.total }),
    { count: 0, total: 0 }
  )
  const pickedStat = value ? stats.get(dayKey(value)) : undefined

  const step = (days: number) => {
    const next = addDays(value || today, days)
    if (next > today && !isSameDay(next, today)) return
    onChange(next)
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => step(-1)}
        title="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          type="button"
          className={cn(
            buttonVariants({ variant: value ? "default" : "outline" }),
            "h-9 min-w-0 flex-1 justify-start gap-2 font-bold sm:min-w-[13rem] sm:flex-initial"
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate">{value ? describeDay(value) : clearLabel || "Pick a date"}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="z-[90] rounded-xl border border-border bg-card text-card-foreground shadow-xl"
          >
            <DayStatsContext.Provider value={stats}>
              <DayPicker
                mode="single"
                selected={value || undefined}
                onSelect={(date) => {
                  if (!date) return
                  onChange(date)
                  setOpen(false)
                }}
                month={month}
                onMonthChange={setMonth}
                endMonth={today}
                disabled={{ after: today }}
                weekStartsOn={1}
                showOutsideDays
                components={{ DayButton: SalesDayButton }}
                classNames={{
                  root: "p-3",
                  months: "relative",
                  month: "space-y-2",
                  month_caption: "flex h-9 items-center justify-center",
                  caption_label: "text-sm font-bold",
                  nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between",
                  button_previous:
                    "inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:pointer-events-none disabled:opacity-30",
                  button_next:
                    "inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:pointer-events-none disabled:opacity-30",
                  chevron: "h-4 w-4 fill-current",
                  month_grid: "border-collapse",
                  weekday: "h-8 w-10 text-[11px] font-semibold uppercase text-muted-foreground",
                  day: "p-0.5 text-center",
                  day_button:
                    "inline-flex h-10 w-10 flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected:
                    "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
                  today: "[&>button]:font-black [&>button]:ring-1 [&>button]:ring-primary/60",
                  outside: "opacity-40",
                  disabled: "opacity-30 [&>button]:pointer-events-none",
                }}
              />
            </DayStatsContext.Provider>

            <div className="space-y-1 border-t border-border px-4 py-3 text-xs">
              {value && (
                <p className="flex justify-between gap-4">
                  <span className="font-semibold">{format(value, "d MMM")}</span>
                  <span className="text-muted-foreground">
                    {pickedStat
                      ? `${pickedStat.count} sale${pickedStat.count === 1 ? "" : "s"} · ${formatCurrency(pickedStat.total)}`
                      : loadingStats
                        ? "…"
                        : "No sales"}
                  </span>
                </p>
              )}
              <p className="flex justify-between gap-4">
                <span className="font-semibold">{format(month, "MMMM yyyy")}</span>
                <span className="text-muted-foreground">
                  {loadingStats
                    ? "Loading…"
                    : `${monthTotals.count} sale${monthTotals.count === 1 ? "" : "s"} · ${formatCurrency(monthTotals.total)}`}
                </span>
              </p>
              <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-primary" /> a dot marks a day with sales
              </p>
            </div>

            <div className="flex gap-2 border-t border-border p-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 font-bold"
                onClick={() => {
                  onChange(new Date())
                  setOpen(false)
                }}
              >
                Today
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 font-bold"
                onClick={() => {
                  onChange(addDays(new Date(), -1))
                  setOpen(false)
                }}
              >
                Yesterday
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => step(1)}
        disabled={!canStepForward}
        title="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {clearLabel && value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange(null)}
          title={`Show ${clearLabel.toLowerCase()}`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
