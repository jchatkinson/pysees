import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'

interface Friction { normalDir: number; shearDir: number; mu: number; k0: number; b: number }
const DEFAULT: Friction = { normalDir: 2, shearDir: 1, mu: 0.5, k0: 1e9, b: 0.001 }

const read = (raw: unknown): Friction | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  return { normalDir: Number(f.normalDir) || DEFAULT.normalDir, shearDir: Number(f.shearDir) || DEFAULT.shearDir, mu: Number(f.mu) || 0, k0: Number(f.k0) || DEFAULT.k0, b: Number(f.b) || 0 }
}

/** Form block for a zeroLength element: Coulomb friction, a Carapace feature (the shear direction slides once it exceeds `mu` times the compression in the normal direction, which needs its own material and the shear direction none). OpenSees has no equivalent, so scripts carry it only as a warning. Stored as the PySees-only `friction` object. */
export function ZeroLengthFrictionField({ values, setValue }: { values: Record<string, unknown>; setValue: (key: string, value: unknown) => void }) {
  const friction = read(values.friction)
  const edit = (patch: Partial<Friction>) => friction && setValue('friction', { ...friction, ...patch })
  const number = (key: keyof Friction, label: string, step?: string) => (
    <div className="grid gap-0.5">
      <Label className="text-[10px]" htmlFor={`friction-${key}`}>{label}</Label>
      <Input id={`friction-${key}`} type="number" step={step ?? 'any'} min={0} value={friction?.[key] ?? ''} onChange={(e) => edit({ [key]: Number(e.target.value) })} />
    </div>
  )
  return (
    <div className="grid gap-2 rounded border p-2">
      <label className="flex items-center gap-2 text-xs font-medium">
        <input type="checkbox" checked={friction !== null} onChange={(e) => setValue('friction', e.target.checked ? DEFAULT : undefined)} />
        Coulomb friction (Carapace only)
      </label>
      {friction && (
        <>
          <p className="text-[10px] text-muted-foreground">The shear direction sticks with stiffness k0, then slides with ratio b once its force exceeds mu × the compression in the normal direction. The normal direction needs a material (such as ENT); the shear direction must not have one. OpenSees has no equivalent: an exported script writes the element without it.</p>
          <div className="grid grid-cols-3 gap-2">
            {number('normalDir', 'Normal dir', '1')}
            {number('shearDir', 'Shear dir', '1')}
            {number('mu', 'mu', '0.05')}
            {number('k0', 'k0 (stick stiffness)')}
            {number('b', 'b (post-slip ratio)', '0.001')}
          </div>
        </>
      )}
    </div>
  )
}
