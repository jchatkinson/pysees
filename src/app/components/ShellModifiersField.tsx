import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { SHELL_MODIFIER_GROUPS, readShellModifiers, type ShellModifierKey } from '@/app/lib/shellModifiers'

/** Form block for an ElasticMembranePlateSection: ETABS-style stiffness modifiers, stored as the PySees-only `modifiers` object (blank = 1). Carapace applies them; OpenSees has no equivalent, so export folds them into E and Ep_modifier when it can. */
export function ShellModifiersField({ values, setValue }: { values: Record<string, unknown>; setValue: (key: string, value: unknown) => void }) {
  const current = readShellModifiers(values) ?? {}
  const edit = (key: ShellModifierKey, text: string) => {
    const next = { ...current }
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) delete next[key]
    else next[key] = n
    setValue('modifiers', Object.keys(next).length ? next : undefined)
  }
  return (
    <div className="grid gap-2 rounded border p-2">
      <Label className="text-xs font-medium">Stiffness modifiers</Label>
      <p className="text-[10px] text-muted-foreground">Scale individual terms of the section stiffness (default 1). Applied by Carapace. OpenSees only represents them when the membrane factors are equal, the bending factors are equal and the shear factors equal the bending factor.</p>
      {SHELL_MODIFIER_GROUPS.map((group) => (
        <div key={group.title} className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{group.title}</span>
          <div className="grid grid-cols-3 gap-2">
            {group.keys.map((key) => (
              <div key={key} className="grid gap-0.5">
                <Label className="text-[10px]" htmlFor={`shell-mod-${key}`}>{key}</Label>
                <Input id={`shell-mod-${key}`} type="number" min={0} step="any" placeholder="1" value={current[key] ?? ''} onChange={(e) => edit(key, e.target.value)} />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">{group.hint}</p>
        </div>
      ))}
    </div>
  )
}
