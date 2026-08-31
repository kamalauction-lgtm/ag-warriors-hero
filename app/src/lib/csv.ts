/* CSV export — client side, no server round-trip. UTF-8 BOM so Excel opens
   Malay/Indonesian names correctly. Headers come from the first row's keys. */
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
