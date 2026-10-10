/** Static accelerogram reader. Never evaluates headers or expressions. */
export interface GroundMotionRecord {
  format: 'PEER' | 'table' | 'values'
  values: number[]
  times?: number[]
  dt?: number
  units?: string
  headers: string[]
}
export interface GroundMotionOptions { layout?: 'auto' | 'values' | 'table'; valueColumn?: number; timeColumn?: number; dt?: number; skipLines?: number }
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?$/
const number = (s: string): number => numeric.test(s.trim()) ? Number(s.trim().replace(/[dD]/, 'e')) : NaN
const MAX_POINTS = 1_000_000

function validate(record: GroundMotionRecord): GroundMotionRecord {
  if (record.values.length < 2) throw new Error('At least two acceleration samples are required.')
  if (record.values.length > MAX_POINTS) throw new Error(`Records are limited to ${MAX_POINTS.toLocaleString()} samples.`)
  if (record.values.some((v) => !Number.isFinite(v))) throw new Error('Acceleration samples must be finite numbers.')
  if (record.dt !== undefined && (!Number.isFinite(record.dt) || record.dt <= 0)) throw new Error('Sample interval must be greater than zero.')
  if (record.times) {
    if (record.times.length !== record.values.length || record.times.some((t, i, a) => !Number.isFinite(t) || t < 0 || (i > 0 && t <= a[i - 1]))) throw new Error('Times must be finite, nonnegative, and strictly increasing.')
    const dt = record.times[1] - record.times[0]
    if (record.times.every((t, i, a) => i === 0 || Math.abs(t - a[i - 1] - dt) <= Math.max(1e-10, dt * 1e-6))) record.dt = dt
  }
  return record
}

/** Supports both NGA `NPTS=..., DT=...` and older `1999 0.0100 NPTS, DT` headers. */
export function parseGroundMotion(text: string, options: GroundMotionOptions = {}): GroundMotionRecord {
  if (text.length > 32_000_000) throw new Error('Record exceeds the 32 MB text limit.')
  const skip = options.skipLines ?? 0
  if (!Number.isInteger(skip) || skip < 0) throw new Error('Header lines to skip must be a nonnegative integer.')
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).slice(skip)
  const peerIndex = lines.findIndex((line) => /\bNPTS\b/i.test(line) && /\bDT\b/i.test(line))
  if (peerIndex >= 0) {
    const line = lines[peerIndex]
    const modern = line.match(/NPTS\s*=\s*(\d+)\s*,?\s*DT\s*=\s*([\d.eEdD+-]+)/i)
    const old = line.match(/^\s*(\d+)\s+([\d.eEdD+-]+)\s+NPTS\s*,?\s*DT/i)
    const match = modern ?? old
    if (!match) throw new Error('Could not read the PEER NPTS and DT header.')
    const count = Number(match[1]), dt = number(match[2])
    if (!Number.isInteger(count) || count < 2 || count > MAX_POINTS) throw new Error('Invalid PEER sample count.')
    const tokens = lines.slice(peerIndex + 1).join(' ').trim().split(/\s+/)
    const values = tokens.map(number)
    if (values.length !== count) throw new Error(`PEER header declares ${count} samples; found ${values.length}.`)
    const headers = lines.slice(0, peerIndex + 1)
    if (/\b(VELOCITY|DISPLACEMENT)\s+(TIME HISTORY|IN UNITS)/i.test(headers.join(' '))) throw new Error('Choose an acceleration record, not velocity or displacement.')
    const units = headers.join(' ').match(/UNITS\s+OF\s+([^\r\n]+?)(?=\s+\d+\s|$)/i)?.[1]?.trim()
    return validate({ format: 'PEER', values, dt, headers, units: /UNITS\s+OF\s+G\b/i.test(headers.join(' ')) ? 'g' : units })
  }
  const headers: string[] = [], rows: number[][] = []
  let width = 0, started = false, sampleCount = 0
  const layout = options.layout ?? 'auto'
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw || /^(#|\/\/|%|;)/.test(raw)) continue
    const data = raw.replace(/\s+(?:#|\/\/).*$/, '')
    const cells = (data.includes(',') ? data.split(',') : data.includes(';') ? data.split(';') : data.split(/\s+/)).map((s) => number(s.trim().replace(/^"(.*)"$/, '$1')))
    if (cells.some((n) => !Number.isFinite(n))) {
      if (started) throw new Error(`Invalid numeric data on line ${i + 1}.`)
      headers.push(raw)
      continue
    }
    started = true
    if (!width) width = cells.length
    if (layout !== 'values' && cells.length !== width) throw new Error(`Inconsistent number of columns on line ${i + 1}.`)
    rows.push(cells)
    sampleCount += layout === 'values' ? cells.length : 1
    if (sampleCount > MAX_POINTS) throw new Error('Record has too many samples.')
  }
  const table = layout === 'table' || (layout === 'auto' && width === 2)
  if (layout === 'auto' && width > 2) throw new Error('Choose packed values or time/acceleration columns for this record.')
  if (table) {
    const valueColumn = options.valueColumn ?? 1, timeColumn = options.timeColumn ?? 0
    if (!Number.isInteger(valueColumn) || !Number.isInteger(timeColumn) || valueColumn < 0 || timeColumn < 0 || valueColumn >= width || timeColumn >= width || valueColumn === timeColumn) throw new Error('Choose different, valid time and acceleration columns.')
    return validate({ format: 'table', values: rows.map((r) => r[valueColumn]), times: rows.map((r) => r[timeColumn]), headers })
  }
  const dtHeader = headers.join(' ').match(/\b(?:DT|DELTA\s*T|TIME\s*STEP)\s*[:=]\s*([\d.eEdD+-]+)/i)
  return validate({ format: 'values', values: rows.flat(), dt: options.dt ?? (dtHeader ? number(dtHeader[1]) : undefined), headers })
}

/** Shared Path validation for preview and the compiler. Values stay unscaled in the authored model. */
export function pathSeries(args: Record<string, unknown>): { times: number[]; factors: number[] } {
  if (args.filePath || args.fileTime) throw new Error('Import the record to embed its samples; browser analysis cannot read external file paths.')
  const values = Array.isArray(args.values) ? args.values.map(Number) : []
  const explicit = Array.isArray(args.time) && args.time.length ? args.time.map(Number) : undefined
  const dt = Number(args.dt)
  const start = args.startTime === undefined || args.startTime === '' ? 0 : Number(args.startTime)
  const factor = args.factor === undefined || args.factor === '' ? 1 : Number(args.factor)
  if (!Number.isFinite(factor) || !Number.isFinite(start) || start < 0) throw new Error('Path factor must be finite and start time must be nonnegative.')
  if (!explicit && (!Number.isFinite(dt) || dt <= 0)) throw new Error('Path sample interval must be greater than zero.')
  const samples = args['-prependZero'] ? [0, ...values] : values
  if (explicit && args['-prependZero']) throw new Error('Prepend zero is supported only with a constant sample interval.')
  const times = explicit ?? samples.map((_, i) => start + i * dt)
  validate({ format: 'values', values: samples, times, headers: [] })
  const factors = samples.map((v) => v * factor)
  if (factors.some((v) => !Number.isFinite(v))) throw new Error('Scaled acceleration must be finite.')
  return { times, factors }
}
