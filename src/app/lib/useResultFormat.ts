import { useMemo } from 'react'
import { useAppStore } from '@/app/store/useAppStore'
import { formatResult } from '@/app/lib/formatResult'

export interface ResultFormat {
  /** Tables, readouts and panels: the user's `digits`, trailing zeros kept unless `pad` is false. */
  value: (v: number, zeroTolerance?: number, pad?: boolean) => string
  /** Viewport value labels: the user's `labelDigits`, shortest text. */
  label: (v: number, zeroTolerance?: number) => string
}

/** Result number formatting at the significant figures chosen in the Units dialog. */
export function useResultFormat(): ResultFormat {
  const { digits, labelDigits } = useAppStore((s) => s.numberFormat)
  return useMemo(() => ({
    value: (v, tol = 0, pad = true) => formatResult(v, digits, tol, pad),
    label: (v, tol = 0) => formatResult(v, labelDigits, tol, false),
  }), [digits, labelDigits])
}
