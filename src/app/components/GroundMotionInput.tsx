import { useId, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/app/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { parseGroundMotion, pathSeries } from '@/app/lib/groundMotion'

/** Peak-preserving buckets keep long accelerograms inexpensive to preview. */
function previewPoints(times: number[], values: number[]) {
  const points: { time: number; acceleration: number }[] = []
  const stride = Math.max(1, Math.ceil(values.length / 600))
  for (let start = 0; start < values.length; start += stride) {
    const end = Math.min(values.length, start + stride)
    let min = start, max = start
    for (let i = start + 1; i < end; i++) { if (values[i] < values[min]) min = i; if (values[i] > values[max]) max = i }
    for (const i of [...new Set([start, min, max, end - 1])].sort((a, b) => a - b)) points.push({ time: times[i], acceleration: values[i] })
  }
  return points
}

export function GroundMotionInput({ values, setValues }: { values: Record<string, unknown>; setValues: (patch: Record<string, unknown>) => void }) {
  const id = useId(), request = useRef(0)
  const [source, setSource] = useState(''), [filename, setFilename] = useState('')
  const [skipLines, setSkipLines] = useState('0')
  const [layout, setLayout] = useState('auto'), [dt, setDt] = useState('')
  const [timeColumn, setTimeColumn] = useState('1'), [valueColumn, setValueColumn] = useState('2')
  const [prependZero, setPrependZero] = useState(true)
  const [conversion, setConversion] = useState(''), [scale, setScale] = useState('1')
  const [readError, setReadError] = useState(''), [busy, setBusy] = useState(false)
  const parsed = useMemo(() => {
    try {
      if (!source) return { record: null, error: '' }
      return { record: parseGroundMotion(source, { layout: layout as 'auto' | 'values' | 'table', timeColumn: Number(timeColumn) - 1, valueColumn: Number(valueColumn) - 1, dt: dt === '' ? undefined : Number(dt), skipLines: Number(skipLines) }), error: '' }
    } catch (e) { return { record: null, error: e instanceof Error ? e.message : String(e) } }
  }, [source, layout, timeColumn, valueColumn, dt, skipLines])
  const preview = useMemo(() => {
    try {
      if (source && !parsed.record) return null
      const record = parsed.record
      if (record) {
        const interval = record.format === 'PEER' ? record.dt : (dt === '' ? record.dt : Number(dt))
        const effectiveConversion = conversion === '' ? (record.units === 'g' ? NaN : 1) : Number(conversion)
        const factor = effectiveConversion * Number(scale)
        if (!Number.isFinite(factor) || scale.trim() === '') throw new Error('Choose a unit conversion and a finite linear scale factor.')
        const series = pathSeries({ values: record.values, time: record.times, dt: interval, factor, '-prependZero': !record.times && prependZero })
        return { ...series, count: record.values.length, interval, factor, error: '' }
      }
      if (!Array.isArray(values.values) || !values.values.length) return null
      return { ...pathSeries(values), count: values.values.length, interval: values.dt, factor: values.factor ?? 1, error: '' }
    } catch (e) { return { error: e instanceof Error ? e.message : String(e), times: [], factors: [], count: 0, interval: undefined, factor: 1 } }
  }, [source, parsed.record, values, dt, conversion, scale, prependZero])
  const points = useMemo(() => preview ? previewPoints(preview.times, preview.factors) : [], [preview])
  const peak = preview?.factors.reduce((p, v) => Math.max(p, Math.abs(v)), 0) ?? 0
  const error = readError || parsed.error || preview?.error
  const select = (label: string, value: string, change: (v: string) => void, options: [string, string][]) => (
    <Field><FieldLabel htmlFor={`${id}-${label}`}>{label}</FieldLabel><Select value={value || null} onValueChange={(v) => change(v ?? '')}><SelectTrigger id={`${id}-${label}`} className="w-full"><SelectValue placeholder="Choose conversion" /></SelectTrigger><SelectContent><SelectGroup>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  )
  return (
    <FieldSet>
      <FieldLegend>Ground-motion record</FieldLegend>
      <FieldDescription>Import PEER NGA (.AT2), CSV, or text with headers. Samples are embedded in the model and exported script.</FieldDescription>
      <FieldGroup className="gap-3">
        <Field><FieldLabel htmlFor={`${id}-file`}>Record file</FieldLabel><Input id={`${id}-file`} type="file" accept=".at2,.AT2,.csv,.txt,.dat,text/*" disabled={busy} onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const token = ++request.current
          setBusy(true); setReadError(''); setSource(''); setFilename(file.name); setDt(''); setConversion('')
          try {
            if (file.size > 32_000_000) throw new Error('Record exceeds the 32 MB limit.')
            const text = await file.text()
            if (token === request.current) setSource(text)
          } catch (e) { if (token === request.current) setReadError(e instanceof Error ? e.message : String(e)) }
          finally { if (token === request.current) setBusy(false) }
        }} /></Field>
        {source && <>
          <Field><FieldLabel htmlFor={`${id}-skip`}>Header lines to skip</FieldLabel><Input id={`${id}-skip`} type="number" min="0" step="1" value={skipLines} onChange={(e) => setSkipLines(e.target.value)} /><FieldDescription>Text headers are detected automatically. Use this for numeric headers.</FieldDescription></Field>
          {select('Data layout', layout, setLayout, [['auto', 'Detect automatically'], ['values', 'Acceleration values (packed or one per line)'], ['table', 'Time / acceleration columns']])}
          {layout === 'table' && <div className="grid grid-cols-2 gap-2"><Field><FieldLabel htmlFor={`${id}-time`}>Time column</FieldLabel><Input id={`${id}-time`} type="number" min="1" step="1" value={timeColumn} onChange={(e) => setTimeColumn(e.target.value)} /></Field><Field><FieldLabel htmlFor={`${id}-value`}>Acceleration column</FieldLabel><Input id={`${id}-value`} type="number" min="1" step="1" value={valueColumn} onChange={(e) => setValueColumn(e.target.value)} /></Field></div>}
          {parsed.record && !parsed.record.times && parsed.record.format !== 'PEER' && <Field><FieldLabel htmlFor={`${id}-dt`}>Sample interval (s)</FieldLabel><Input id={`${id}-dt`} type="number" min="0" step="any" placeholder={String(parsed.record.dt ?? 'Required')} value={dt} onChange={(e) => setDt(e.target.value)} /></Field>}
          {parsed.record && !parsed.record.times && <Field orientation="horizontal"><Checkbox id={`${id}-zero`} checked={prependZero} onCheckedChange={setPrependZero} /><FieldLabel htmlFor={`${id}-zero`}>Prepend zero acceleration (start from rest)</FieldLabel></Field>}
          {select('Record → model acceleration units', conversion, setConversion, [['1', 'Already in model units (×1)'], ['9.80665', 'g → m/s² (×9.80665)'], ['9806.65', 'g → mm/s² (×9806.65)'], ['980.665', 'g → cm/s² (×980.665)'], ['386.08858267716535', 'g → in/s² (×386.089)'], ['32.17404855643044', 'g → ft/s² (×32.174)'], ['0.01', 'cm/s² → m/s² (×0.01)']])}
          {parsed.record?.units && <FieldDescription>File declares acceleration in {parsed.record.units}. Choose the conversion matching your model’s length units.</FieldDescription>}
          <Field><FieldLabel htmlFor={`${id}-scale`}>Linear scale factor</FieldLabel><Input id={`${id}-scale`} type="number" step="any" value={scale} onChange={(e) => setScale(e.target.value)} /><FieldDescription>Applied after unit conversion. Negative values reverse the direction; zero disables the motion.</FieldDescription></Field>
        </>}
        {!source && Array.isArray(values.values) && values.values.length > 0 && <>
          {(!Array.isArray(values.time) || !values.time.length) && <Field orientation="horizontal"><Checkbox id={`${id}-saved-zero`} checked={values['-prependZero'] === true} onCheckedChange={(checked) => setValues({ '-prependZero': checked })} /><FieldLabel htmlFor={`${id}-saved-zero`}>Prepend zero acceleration</FieldLabel></Field>}
          <Field orientation="horizontal"><Checkbox id={`${id}-last`} checked={values['-useLast'] === true} onCheckedChange={(checked) => setValues({ '-useLast': checked })} /><FieldLabel htmlFor={`${id}-last`}>Hold last acceleration after the record</FieldLabel></Field>
        </>}
        {error && <FieldError>{error}</FieldError>}
        {preview && !preview.error && <>
          <FieldDescription>{filename && `${filename} · `}{preview.count.toLocaleString()} samples · {preview.times[0].toPrecision(4)}–{preview.times.at(-1)!.toPrecision(4)} s{preview.interval ? ` · dt ${preview.interval} s` : ' · variable time spacing'}<br />{source && !parsed.record?.times && prependZero && <>Zero sample prepended · </>}Peak |a| {peak.toPrecision(5)} · total factor {Number(preview.factor).toPrecision(5)} (model units)</FieldDescription>
          <div className="h-44 w-full min-w-0" role="img" aria-label="Scaled acceleration versus time preview">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 8, right: 8, bottom: 16, left: 0 }}><CartesianGrid stroke="var(--border)" /><XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => v.toPrecision(3)} label={{ value: 'Time (s)', position: 'insideBottom', offset: -12 }} /><YAxis width={55} tickFormatter={(v: number) => v.toPrecision(2)} /><Tooltip labelFormatter={(v) => `Time ${Number(v).toPrecision(5)} s`} /><Line dataKey="acceleration" name="Acceleration" stroke="var(--primary)" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
          </div>
          {source && <Button variant="outline" size="sm" disabled={busy || !!error} onClick={() => {
            if (!parsed.record) return
            setValues({ values: parsed.record.values, time: parsed.record.times ?? [], dt: parsed.record.times ? undefined : preview.interval, factor: preview.factor, startTime: 0, filePath: '', fileTime: '', '-prependZero': !parsed.record.times && prependZero, '-useLast': false })
            setSource('')
          }}>Use this record</Button>}
        </>}
        <FieldDescription>Next: add a UniformExcitation pattern referencing this series, then Run Earthquake Analysis. Use compatible mass, length and time units. Responses are relative to the ground.</FieldDescription>
      </FieldGroup>
    </FieldSet>
  )
}
