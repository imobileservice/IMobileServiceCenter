"use client"

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  Package,
  Layers,
  Boxes,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ClipboardList,
  ArrowRight,
} from "lucide-react"
import { assistantService, type AssistantOverview } from "@/lib/services/assistant.service"
import { formatCurrency } from "@/lib/utils/currency"
import AssistantLayout from "@/components/assistant/assistant-layout"
import { toast } from "sonner"

/**
 * The assistant's dashboard: how many products there are, how much stock is on
 * the shelves, how big each category is, and where the stock needs attention.
 *
 * Every figure comes from /api/assistant/overview, which reads only products,
 * categories and inv_stock. There is no revenue, order or customer number here
 * because the endpoint that feeds this page cannot produce one.
 */
export default function AssistantDashboardPage() {
  const [overview, setOverview] = useState<AssistantOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    assistantService
      .overview()
      .then(setOverview)
      .catch((error) => {
        // A permission refusal is expected and already explained by the layout.
        if (error?.code !== "PERMISSION_DENIED") {
          toast.error(error?.message || "Could not load the dashboard")
        }
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <AssistantLayout
      permission="dashboard.view"
      title="Inventory overview"
      description="Products, stock levels and category sizes."
    >
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : !overview ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nothing to show yet.
        </div>
      ) : (
        <div className="space-y-6">
          {overview.totals.pendingRequests > 0 && (
            <Link
              to="/assistant/requests"
              className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/15"
            >
              <div className="flex items-center gap-3">
                <ClipboardList className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {overview.totals.pendingRequests} change
                    {overview.totals.pendingRequests === 1 ? "" : "s"} waiting for approval
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                    Nothing has been changed until the administrator approves.
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-amber-500" />
            </Link>
          )}

          {/* Headline counts */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Package}
              label="Products"
              value={overview.totals.products.toLocaleString()}
              hint={`${overview.totals.uncategorised} without a category`}
            />
            <StatCard
              icon={Boxes}
              label="Total quantity in stock"
              value={overview.totals.quantity.toLocaleString()}
              hint={`Retail value ${formatCurrency(overview.totals.retailStockValue, { showDecimals: false })}`}
            />
            <StatCard
              icon={Layers}
              label="Categories"
              value={overview.totals.categories.toLocaleString()}
              hint={`${overview.totals.activeCategories} active`}
            />
            <StatCard
              icon={AlertTriangle}
              label="Needs restocking"
              value={(overview.totals.lowStock + overview.totals.outOfStock).toLocaleString()}
              hint={`${overview.totals.outOfStock} out of stock`}
              tone="warning"
            />
          </section>

          {/* Stock health */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-1">
              <h2 className="text-sm font-semibold">Stock health</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Every product measured against its own low-stock threshold.
              </p>

              <div className="mt-4 space-y-3">
                <HealthRow
                  icon={CheckCircle2}
                  tone="ok"
                  label="Healthy"
                  value={overview.totals.healthy}
                  total={overview.totals.products}
                />
                <HealthRow
                  icon={AlertTriangle}
                  tone="warn"
                  label="Low stock"
                  value={overview.totals.lowStock}
                  total={overview.totals.products}
                />
                <HealthRow
                  icon={XCircle}
                  tone="bad"
                  label="Out of stock"
                  value={overview.totals.outOfStock}
                  total={overview.totals.products}
                />
              </div>

              <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock value at cost</span>
                  <span className="font-medium">
                    {formatCurrency(overview.totals.costStockValue, { showDecimals: false })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock value at retail</span>
                  <span className="font-medium">
                    {formatCurrency(overview.totals.retailStockValue, { showDecimals: false })}
                  </span>
                </div>
                {overview.totals.missingStockRow > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <span>Products with no stock record</span>
                    <span className="font-medium">{overview.totals.missingStockRow}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Where the stock sits */}
            <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold">Quantity by shop</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Where the {overview.totals.quantity.toLocaleString()} units currently are.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ShopCard label="Meegoda" value={overview.shopSplit.meegoda} total={overview.totals.quantity} />
                <ShopCard label="Padukka" value={overview.shopSplit.padukka} total={overview.totals.quantity} />
                <ShopCard
                  label="Padukka (New)"
                  value={overview.shopSplit.padukka_new}
                  total={overview.totals.quantity}
                />
              </div>

              <h3 className="mt-6 text-sm font-semibold">Recently added</h3>
              <div className="mt-3 space-y-2">
                {overview.recentProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No products yet.</p>
                ) : (
                  overview.recentProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{product.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {product.brand || "No brand"}
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 text-xs font-semibold">{product.quantity} in stock</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Category sizes */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Category sizes</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  How many products sit in each category, and how much stock that represents.
                </p>
              </div>
              <Link to="/assistant/categories" className="text-xs font-medium text-primary hover:underline">
                Manage categories
              </Link>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 text-right font-medium">Products</th>
                    <th className="pb-2 text-right font-medium">Units in stock</th>
                    <th className="pb-2 pl-4 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.categoryBreakdown.map((category) => {
                    const share = overview.totals.products
                      ? Math.round((category.product_count / overview.totals.products) * 100)
                      : 0
                    return (
                      <tr key={category.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5">
                          <span className="font-medium">{category.name}</span>
                          {!category.is_active && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              inactive
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{category.product_count}</td>
                        <td className="py-2.5 text-right tabular-nums">{category.quantity}</td>
                        <td className="py-2.5 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                            </div>
                            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {overview.categoryBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                        No categories yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* What to restock */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Restock first</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  At or below the low-stock threshold, lowest first.
                </p>
              </div>
              <Link to="/assistant/inventory" className="text-xs font-medium text-primary hover:underline">
                Open inventory
              </Link>
            </div>

            {overview.lowStockItems.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Everything is above its threshold. Nothing to restock.
              </p>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {overview.lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${
                      item.quantity === 0
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    }`}
                  >
                    <p className="truncate text-xs font-medium">{item.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{item.brand || "No brand"}</p>
                    <p
                      className={`mt-1.5 text-xs font-semibold ${
                        item.quantity === 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {item.quantity === 0 ? "Out of stock" : `${item.quantity} left`}
                      <span className="font-normal text-muted-foreground"> · threshold {item.threshold}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AssistantLayout>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: any
  label: string
  value: string
  hint?: string
  tone?: "default" | "warning"
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${tone === "warning" ? "text-amber-500" : "text-muted-foreground"}`} />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function HealthRow({
  icon: Icon,
  tone,
  label,
  value,
  total,
}: {
  icon: any
  tone: "ok" | "warn" | "bad"
  label: string
  value: number
  total: number
}) {
  const percent = total ? Math.round((value / total) * 100) : 0
  const colour =
    tone === "ok" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-red-500"
  const bar = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-red-500"

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${colour}`} />
          {label}
        </span>
        <span className="font-medium tabular-nums">
          {value} <span className="text-muted-foreground">({percent}%)</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function ShopCard({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{percent}% of all units</p>
    </div>
  )
}
