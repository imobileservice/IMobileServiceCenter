"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

/**
 * Bulk "one product -> many models" import.
 *
 *   SKU     | Product   | Compatible Models
 *   DSP001  | Display A | Redmi Note 8, Redmi Note 8T, Redmi Note 9
 *
 * Accepts a paste straight out of Excel (tab separated) or a .csv file, so no
 * spreadsheet library is needed. Rows match EXISTING products only - the import
 * cannot create a product, which is what keeps one display from becoming five.
 */

interface ImportResultRow {
  row: number
  sku: string
  product: string
  status: "linked" | "skipped"
  message: string
  linked: number
  created_models: number
}

interface ImportSummary {
  rows: number
  linked: number
  skipped: number
  compatibility_rows: number
  models_created: number
  products_created: number
}

interface ParsedRow {
  sku: string
  product: string
  models: string[]
}

const SAMPLE = `SKU\tProduct\tCompatible Models
DSP001\tDisplay A\tRedmi Note 8, Redmi Note 8T, Redmi Note 9, Redmi Note 9S`

/** Split one CSV/TSV line, honouring "quoted, values". */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current)
      current = ""
    } else {
      current += char
    }
  }

  cells.push(current)
  return cells.map((c) => c.trim())
}

function parseSheet(text: string): { rows: ParsedRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return { rows: [], error: "Nothing to import" }

  // Excel pastes are tab separated; a saved .csv is comma separated.
  const delimiter = lines[0].includes("\t") ? "\t" : ","

  let startIndex = 0
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase())
  const looksLikeHeader = header.some((h) => h === "sku" || h === "product" || h.includes("model"))

  let skuIndex = 0
  let productIndex = 1
  let modelsIndex = 2

  if (looksLikeHeader) {
    startIndex = 1
    const findIndex = (...names: string[]) =>
      header.findIndex((h) => names.some((n) => h === n || h.includes(n)))

    const sku = findIndex("sku", "code")
    const product = findIndex("product", "name", "item")
    const models = findIndex("compatible models", "models", "compatible", "phones")

    if (sku >= 0) skuIndex = sku
    if (product >= 0) productIndex = product
    if (models >= 0) modelsIndex = models
  }

  const rows: ParsedRow[] = []
  for (let i = startIndex; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter)
    const sku = (cells[skuIndex] || "").trim()
    const product = (cells[productIndex] || "").trim()
    const modelsCell = (cells[modelsIndex] || "").trim()

    if (!sku && !product) continue

    const models = modelsCell
      .split(/[,;|]/)
      .map((m) => m.trim())
      .filter(Boolean)

    rows.push({ sku, product, models })
  }

  if (rows.length === 0) return { rows: [], error: "No data rows found" }
  return { rows }
}

interface CompatibilityImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImported?: () => void
}

export default function CompatibilityImportModal({
  isOpen,
  onClose,
  onImported,
}: CompatibilityImportModalProps) {
  const [text, setText] = useState("")
  const [mode, setMode] = useState<"merge" | "replace">("merge")
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ImportResultRow[] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [wasDryRun, setWasDryRun] = useState(false)

  if (!isOpen) return null

  const readFile = async (file: File) => {
    const content = await file.text()
    setText(content)
    setResults(null)
    setSummary(null)
  }

  const run = async (dryRun: boolean) => {
    const parsed = parseSheet(text)
    if (parsed.error) {
      toast.error(parsed.error)
      return
    }

    setRunning(true)
    try {
      const response = await fetch(getApiUrl("/api/admin/compatibility/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, mode, dryRun }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Import failed")

      setResults(data.results || [])
      setSummary(data.summary || null)
      setWasDryRun(dryRun)

      if (dryRun) {
        toast.success(`Preview: ${data.summary?.linked || 0} row(s) ready, ${data.summary?.skipped || 0} skipped`)
      } else {
        toast.success(
          `${data.summary?.compatibility_rows || 0} compatibility links saved across ${data.summary?.linked || 0} product(s)`
        )
        onImported?.()
      }
    } catch (error: any) {
      toast.error(error?.message || "Import failed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-background">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Import Compatible Models</h2>
          </div>
          <button type="button" onClick={onClose} disabled={running} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Paste rows straight from Excel, or upload a .csv. Each row attaches models to a
              product that <strong>already exists</strong> - importing never creates a product and
              never changes stock.
            </p>
            <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">{SAMPLE}</pre>
          </div>

          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setResults(null)
            }}
            rows={8}
            placeholder="Paste your rows here..."
            className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono text-xs"
            disabled={running}
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg cursor-pointer text-sm hover:bg-muted">
              <Upload className="w-4 h-4" />
              Upload .csv
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                disabled={running}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) readFile(file)
                }}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
                disabled={running}
              />
              Add to existing models
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
                disabled={running}
              />
              Replace the model list
            </label>
          </div>

          {summary && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p className="font-semibold mb-1">
                {wasDryRun ? "Preview" : "Imported"}: {summary.linked} of {summary.rows} rows
              </p>
              <p className="text-muted-foreground text-xs">
                {summary.compatibility_rows} compatibility links · {summary.models_created} new phone
                models · {summary.products_created} products created · {summary.skipped} skipped
              </p>
            </div>
          )}

          {results && results.length > 0 && (
            <div className="border border-border rounded-lg max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2">SKU</th>
                    <th className="text-left p-2">Product</th>
                    <th className="text-left p-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.row} className="border-t border-border">
                      <td className="p-2">{row.row}</td>
                      <td className="p-2 font-mono">{row.sku || "-"}</td>
                      <td className="p-2">{row.product || "-"}</td>
                      <td
                        className={`p-2 ${row.status === "linked" ? "text-green-600" : "text-orange-600"}`}
                      >
                        {row.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-border sticky bottom-0 bg-background">
          <Button variant="outline" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button variant="outline" onClick={() => run(true)} disabled={running || !text.trim()}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Preview
          </Button>
          <Button onClick={() => run(false)} disabled={running || !text.trim()}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Import
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
