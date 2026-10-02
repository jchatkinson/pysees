/** One row per step; each series contributes an x and a y column. */
export function seriesToCsv(series: { label: string; x: ArrayLike<number>; y: ArrayLike<number> }[]): string {
  const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = Math.max(0, ...series.map((s) => Math.min(s.x.length, s.y.length)))
  const lines = [['step', ...series.flatMap((s) => [`${s.label} [x]`, `${s.label} [y]`])].map(quote).join(',')]
  for (let i = 0; i < rows; i++) lines.push([String(i), ...series.flatMap((s) => [i < s.x.length ? String(s.x[i]) : '', i < s.y.length ? String(s.y[i]) : ''])].join(','))
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
