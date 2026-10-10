export interface ModalDampingAnchors { mode1: number; mode2: number; ratio: number }

/** Equal damping ratio at two anchor frequencies, with C = alphaM M + betaK Kcurrent. */
export function rayleighDamping(params: Record<string, unknown>) {
  let alphaM = Number(params.alphaM ?? 0), betaK = Number(params.betaK ?? 0)
  let modalAnchors: ModalDampingAnchors | undefined
  let omega1: number | undefined, omega2: number | undefined, error: string | undefined
  if (params.dampingMode === 'Modal periods') {
    const mode = (value: unknown) => Number(/^T([1-9]\d*)$/i.exec(String(value).trim())?.[1] ?? NaN)
    const mode1 = mode(params.modalPeriod1 ?? 'T1'), mode2 = mode(params.modalPeriod2 ?? 'T3')
    const percent = Number(params.dampingPercent ?? 5)
    if (![mode1, mode2].every((v) => Number.isSafeInteger(v) && v > 0 && v <= 0xffffffff)) error = 'Use a modal period name such as T1 or T3.'
    else if (params.dampingPercent === '' || !Number.isFinite(percent) || percent < 0 || percent > 100) error = 'Damping must be between 0 and 100 percent.'
    else { modalAnchors = { mode1, mode2, ratio: percent / 100 }; alphaM = 0; betaK = 0 }
  } else if (params.dampingMode === 'Anchor periods') {
    const t1 = Number(params.period1), t2 = Number(params.period2), percent = Number(params.dampingPercent ?? 5)
    if (![t1, t2].every((t) => Number.isFinite(t) && t > 0) || !Number.isFinite(t1 + t2)) error = 'Both anchor periods must be positive, finite values in seconds.'
    else if (params.dampingPercent === '' || !Number.isFinite(percent) || percent < 0 || percent > 100) error = 'Damping must be between 0 and 100 percent.'
    else {
      omega1 = 2 * Math.PI / t1; omega2 = 2 * Math.PI / t2
      const zeta = percent / 100
      // Period form avoids multiplying two potentially large angular frequencies.
      alphaM = 4 * Math.PI * zeta / (t1 + t2)
      betaK = zeta / Math.PI * (t1 / (t1 + t2)) * t2
    }
  }
  if (!error && (![alphaM, betaK].every((v) => Number.isFinite(v) && v >= 0) ||
    (omega1 !== undefined && ![omega1, omega2].every((v) => Number.isFinite(v))))) error = 'Damping coefficients and frequencies must be finite and nonnegative.'
  return { alphaM: error ? NaN : alphaM, betaK: error ? NaN : betaK, omega1, omega2, modalAnchors, error }
}
