import { useMemo } from 'react'
import { useAppStore } from '@/app/store/useAppStore'
import { makeUnitContext, type UnitContext } from '@/app/lib/units/units'

/** The active unit context: the model's base units with the user's display choices. Unitless models get an inactive context that converts nothing. */
export function useUnits(): UnitContext {
  const base = useAppStore((s) => s.model.config?.units)
  const prefs = useAppStore((s) => s.unitPrefs)
  return useMemo(() => makeUnitContext(base, prefs), [base, prefs])
}
