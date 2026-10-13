import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore } from '@/app/store/useAppStore'
import { useUnits } from '@/app/lib/units/useUnits'
import { baseUnitsLabel, CATEGORIES, CATEGORY_IDS, derivedUnit, unitOptions, UNIT_PRESETS, type Category, type UnitPrefs } from '@/app/lib/units/units'

const AUTO = '__auto__'

/** Display units per quantity category. The model's own (base) system is fixed; these only change how numbers are shown and typed. */
export function UnitsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const base = useAppStore((s) => s.model.config?.units)
  const prefs = useAppStore((s) => s.unitPrefs)
  const setUnitPref = useAppStore((s) => s.setUnitPref)
  const setUnitPrefs = useAppStore((s) => s.setUnitPrefs)
  const assignUnits = useAppStore((s) => s.assignUnits)
  const units = useUnits()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Units</DialogTitle>
          <DialogDescription>
            {base
              ? <>The model is stored in <span className="font-medium text-foreground">{baseUnitsLabel(base)}</span> (fixed). Choose how each quantity is shown and entered; a field also accepts a typed unit, e.g. “4 ft”.</>
              : 'This model has no units: values are plain numbers. Declare the system its numbers are already in to label fields and export with units. No value is changed.'}
          </DialogDescription>
        </DialogHeader>
        {!base ? (
          <div className="grid gap-1.5">
            {UNIT_PRESETS.map((p) => <Button key={p.id} variant="outline" size="sm" className="justify-start" onClick={() => assignUnits(p.units)}>{p.label}</Button>)}
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto grid gap-2 pr-1">
            <div className="flex flex-wrap gap-1.5">
              {UNIT_PRESETS.map((p) => (
                <Button key={p.id} variant="outline" size="xs" onClick={() => setUnitPrefs({ length: p.units.length, force: p.units.force } as UnitPrefs)}>{p.label}</Button>
              ))}
              <Button variant="ghost" size="xs" onClick={() => setUnitPrefs({})} disabled={Object.keys(prefs).length === 0}>Reset</Button>
            </div>
            {CATEGORY_IDS.map((cat: Category) => {
              const explicit = prefs[cat]
              const auto = derivedUnit(cat, (prefs.length ?? base.length) as typeof base.length, (prefs.force ?? base.force) as typeof base.force, base.time)
              return (
                <div key={cat} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                  <span className="text-xs">{CATEGORIES[cat].label}</span>
                  <Select value={explicit ?? AUTO} onValueChange={(v) => setUnitPref(cat, v === AUTO || !v ? null : v)}>
                    <SelectTrigger size="sm" className="w-full"><SelectValue>{units.symbol(cat)}{explicit ? '' : ' (auto)'}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {cat !== 'length' && cat !== 'force' && cat !== 'time' && <SelectItem value={AUTO}>{auto.sym} (auto)</SelectItem>}
                      {unitOptions(cat).map((u) => <SelectItem key={u.sym} value={u.sym}>{u.sym}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
