import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft, ChevronsRight, House, Palette, Pause, Play } from 'lucide-react'
import { Button, buttonVariants } from '@/app/components/ui/button'
import { Separator } from '@/app/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/app/components/ui/dropdown-menu'
import { PiscesLogo } from '@/app/components/icons/PiscesLogo'
import { patternColor } from '@/app/components/r3f/utils'
import { useAppStore } from '@/app/store/useAppStore'
import { useHotkeyRegistry, type HotkeyBinding } from '@/app/lib/hotkeys'
import { useCurrentCase } from '@/app/lib/resultsStorage/useCases'
import { cn } from '@/app/lib/utils'
import { COMMANDS, RIBBON_TABS, currentView, parseHotkey, runCommand, type CommandId, type RibbonCommand, type RibbonGroupDef } from './commands'
import { FileGroup } from './FileGroup'
import { RibbonAction, Tip } from './parts'

const COLLAPSED_KEY = 'pysees.ribbon.collapsed'
const TAB_KEY = 'pysees.ribbon.tab'
const readPref = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* storage unavailable */ } }

function RibbonButton({ id, compact }: { id: CommandId; compact: boolean }) {
  const cmd: RibbonCommand = COMMANDS[id]
  const active = useAppStore((s) => cmd.isActive?.(s) ?? false)
  const enabled = useAppStore((s) => cmd.enabled?.(s) ?? true)
  const visible = useAppStore((s) => cmd.visible?.(s) ?? true)
  if (!visible) return null
  return <RibbonAction label={cmd.label} tip={cmd.tip} icon={cmd.icon} hotkey={cmd.hotkey?.[0]} disabled={!enabled} compact={compact} pressed={cmd.isActive ? active : undefined} onClick={() => runCommand(id)} />
}

/** Story / grid picker for plan and elevation views, with up/down stepping. */
function StoriesControl({ compact }: { compact: boolean }) {
  const mode = useAppStore(currentView)
  const levels = useAppStore((s) => s.levels)
  const gridlines = useAppStore((s) => s.gridlines)
  const ndm = useAppStore((s) => s.model.config?.ndm)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const items = mode.kind === 'plan'
    ? [...levels.map((l, i) => ({ value: String(i), label: l.label })).reverse(), { value: '-1', label: 'Base' }]
    : mode.kind === 'elevation' && ndm === 3 ? gridlines.map((g) => ({ value: String(g.id), label: `Grid ${g.label}` })) : []
  const value = mode.kind === 'plan' ? String(mode.level) : mode.kind === 'elevation' && mode.gridId !== null ? String(mode.gridId) : ''
  const pick = (v: string | null) => { if (v === null) return; setViewMode(mode.kind === 'plan' ? { kind: 'plan', level: Number(v) } : { kind: 'elevation', gridId: Number(v) }) }
  return (
    <div className={cn('flex items-center gap-0.5', !compact && 'h-11')}>
      <Select items={items} value={value} onValueChange={pick} disabled={items.length === 0}>
        <SelectTrigger size="sm" className="h-7 w-28 rounded-none text-xs"><SelectValue placeholder={mode.kind === '3d' ? '3D view' : '—'} /></SelectTrigger>
        <SelectContent>{items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex flex-col">
        <RibbonButton id="viewNext" compact />
        {!compact && <RibbonButton id="viewPrev" compact />}
      </div>
      {compact && <RibbonButton id="viewPrev" compact />}
    </div>
  )
}

/** Load pattern visibility, as a dropdown beside the load toggles. */
function LoadPatternsControl({ compact }: { compact: boolean }) {
  const patterns = useAppStore((s) => s.model.patterns)
  const hidden = useAppStore((s) => s.hiddenLoadPatterns)
  const toggle = useAppStore((s) => s.toggleLoadPatternVisible)
  const sorted = useMemo(() => [...patterns.values()].sort((a, b) => a.id - b.id), [patterns])
  const ids = sorted.map((p) => p.id)
  return (
    <DropdownMenu>
      <Tip text="Load patterns shown">
        <DropdownMenuTrigger disabled={sorted.length === 0} render={
          <Button variant="ghost" aria-label="Load patterns shown" className={cn('rounded-none', compact ? 'size-7 p-0' : 'h-11 min-w-11 flex-col gap-1 px-1.5')}>
            <Palette className="size-4" />{!compact && <span className="text-[10px] leading-none">Patterns</span>}
          </Button>
        } />
      </Tip>
      <DropdownMenuContent>
        {sorted.map((p) => (
          <DropdownMenuCheckboxItem key={p.id} checked={!hidden.includes(p.id)} onCheckedChange={() => toggle(p.id)}>
            <span className="inline-block size-2 rounded-full" style={{ background: patternColor(ids, p.id) }} />
            {p.name ?? `Pattern ${p.id}`}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Step through the current case: first / previous / play / next / last. */
function PlaybackControl({ compact }: { compact: boolean }) {
  const rv = useAppStore((s) => s.resultsView)
  const set = useAppStore((s) => s.setResultsView)
  const { current, series } = useCurrentCase()
  const first = series?.first ?? 0
  const last = series ? series.first + series.count - 1 : 0
  const modal = current?.kind === 'modal'
  const disabled = !rv.runId || !series
  const goto = (step: number) => set({ step: Math.min(last, Math.max(first, step)), stepFrac: 0, playing: false })
  const btn = (label: string, icon: React.ReactNode, onClick: () => void, off = false) => (
    <Tip text={label}><Button variant="ghost" aria-label={label} disabled={disabled || off} onClick={onClick} className="size-7 p-0 rounded-none">{icon}</Button></Tip>
  )
  return (
    <div className={cn('flex items-center gap-0.5', !compact && 'h-11')}>
      {!modal && btn('First step', <ChevronsLeft className="size-4" />, () => goto(first), rv.step <= first)}
      {!modal && btn('Previous step', <ChevronLeft className="size-4" />, () => goto(rv.step - 1), rv.step <= first)}
      {btn(rv.playing ? 'Pause' : modal ? 'Animate mode' : 'Play', rv.playing ? <Pause className="size-4" /> : <Play className="size-4" />, () => set({ playing: !rv.playing }))}
      {!modal && btn('Next step', <ChevronRight className="size-4" />, () => goto(rv.step + 1), rv.step >= last)}
      {!modal && btn('Last step', <ChevronsRight className="size-4" />, () => goto(last), rv.step >= last)}
      <span className="px-1 text-[10px] tabular-nums text-muted-foreground w-14 text-center">
        {disabled ? '—' : modal ? `mode ${rv.mode + 1}` : `${rv.step - first} / ${last - first}`}
      </span>
    </div>
  )
}

const CUSTOM = { stories: StoriesControl, loadPatterns: LoadPatternsControl, playback: PlaybackControl, file: FileGroup }

function RibbonGroup({ group, compact }: { group: RibbonGroupDef; compact: boolean }) {
  const Custom = group.custom ? CUSTOM[group.custom] : null
  return (
    <div className="flex flex-col items-center px-1">
      <div className="flex items-center gap-0.5 py-0.5">
        {group.commands?.map((id) => <RibbonButton key={id} id={id} compact={compact} />)}
        {Custom && <Custom compact={compact} />}
      </div>
      {!compact && <span className="text-[10px] text-muted-foreground pb-0.5">{group.label}</span>}
    </div>
  )
}

/** Hotkeys for every command that declares one (`mod` = Ctrl, or Cmd on macOS). */
function useCommandHotkeys() {
  const bindings = useMemo<HotkeyBinding[]>(() => Object.values(COMMANDS as Record<string, RibbonCommand>).flatMap((cmd) => (cmd.hotkey ?? []).map((hk) => {
    const { key, mod, shift, alt, isMac } = parseHotkey(hk)
    return { id: `ribbon.${cmd.id}.${hk}`, description: cmd.tip ?? cmd.label, key, shift, alt, ctrl: mod && !isMac, meta: mod && isMac, action: () => runCommand(cmd.id as CommandId) }
  })), [])
  useHotkeyRegistry(bindings)
}

/**
 * The app's menu and toolbar in one: a header row (logo, File, tabs, links) over the active tab's groups of commands from
 * `commands.ts`. The groups collapse to one icon row. Finishing an analysis run switches to the Results tab.
 */
export function Ribbon() {
  const [tab, setTab] = useState(() => { const t = readPref(TAB_KEY); return RIBBON_TABS.some((x) => x.id === t) ? t! : 'model' })
  const [collapsed, setCollapsed] = useState(() => readPref(COLLAPSED_KEY) === '1')
  useCommandHotkeys()
  const current = RIBBON_TABS.find((t) => t.id === tab) ?? RIBBON_TABS[0]
  const pickTab = (id: string) => { setTab(id); writePref(TAB_KEY, id) }
  const toggleCollapsed = () => { setCollapsed(!collapsed); writePref(COLLAPSED_KEY, collapsed ? '0' : '1') }

  const runStatus = useAppStore((s) => s.carapaceRun.status)
  const [seenStatus, setSeenStatus] = useState(runStatus)
  if (seenStatus !== runStatus) {
    setSeenStatus(runStatus)
    if (runStatus === 'done' && tab !== 'results') setTab('results')
  }
  useEffect(() => { writePref(TAB_KEY, tab) }, [tab])

  return (
    <header className="border-b shrink-0 select-none">
      <div className="flex items-center h-8 px-2 gap-1 border-b">
        <Link to="/" className="flex items-center gap-1.5 pr-2 text-sm font-semibold" aria-label="PySees home">
          <PiscesLogo className="size-4 text-primary" aria-hidden="true" />
          PySees
        </Link>
        {RIBBON_TABS.map((t) => (
          <Button key={t.id} variant="ghost" className={cn('h-6 px-3 rounded-none text-[11px]', t.id === current.id && 'bg-accent text-accent-foreground')} onClick={() => pickTab(t.id)}>{t.label}</Button>
        ))}
        <Button variant="ghost" size="icon" className="size-6 rounded-none" aria-label={collapsed ? 'Expand toolbar' : 'Collapse toolbar'} onClick={toggleCollapsed}>
          {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Link to="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-6 px-2 text-xs' })}><House />Home</Link>
          <a href="/docs" target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-6 px-2 text-xs' })}><BookOpen />Docs</a>
        </div>
      </div>
      <div className="flex items-stretch px-1 overflow-x-auto">
        {current.groups.map((g, i) => (
          <Fragment key={g.label}>
            {i > 0 && <Separator orientation="vertical" className="self-stretch my-1" />}
            <RibbonGroup group={g} compact={collapsed} />
          </Fragment>
        ))}
      </div>
    </header>
  )
}
