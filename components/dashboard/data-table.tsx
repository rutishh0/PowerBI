"use client"

interface DataTableProps {
  columns: string[]
  rows: Record<string, string>[]
  maxHeight?: number
}

export function DataTable({ columns, rows, maxHeight = 500 }: DataTableProps) {
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No data to display.
      </p>
    )
  }

  return (
    <div
      className="overflow-auto rounded-lg border border-border shadow-sm"
      style={{ maxHeight }}
    >
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-rr-navy">
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2.5 text-left font-semibold text-card whitespace-nowrap tracking-wide text-[0.7rem]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-border transition-colors ${
                ri % 2 === 0 ? "bg-card" : "bg-muted/30"
              } hover:bg-rr-navy/5`}
            >
              {columns.map((col) => {
                const val = row[col] || "\u2014"
                const isAmount = col === "Amount"
                const isNegative = isAmount && val.startsWith("-")
                return (
                  <td
                    key={col}
                    className={`px-3 py-2 whitespace-nowrap text-card-foreground ${
                      isAmount ? "font-semibold tabular-nums" : ""
                    } ${isNegative ? "text-rr-green" : ""}`}
                  >
                    {val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
