import { describe, expect, it } from 'vitest'
import type { WallLayoutSpec } from '@/app/carapace/wasm/carapace_wasm'
import { applyFraming, framingStiffness, guessFraming, lumberScale, type WallFraming } from './lumber'

const E = 9500, ea = E * 38 * 140
const template: WallLayoutSpec = {
  length: 3600, height: 2440, studs: [0, 400, 1200, 2400, 3600].map((x) => ({ x, ea: x === 0 || x === 3600 ? 3 * ea : ea })),
  topEa: 2 * ea, topEi: 2 * E * 140 * 38 ** 3 / 12, topDistribution: 'beam', bottomEa: ea, bottomEi: E * 140 * 38 ** 3 / 12,
  openings: [{ x0: 1200, x1: 2400, headHeight: 2100, headerEi: 2 * E * 38 * 235 ** 3 / 12, jackEa: ea, door: false }],
  sheathing: { law: { kind: 'linear', ga: 11000 } }, floor: { depth: 254, ga: 5000, rimEa: 9000 * 32 * 254 },
}
const nmm = lumberScale({ length: 'mm', force: 'N', time: 's' }, 2440)

describe('lumber framing', () => {
  it('reads the template wall as S-P-F 2x6 with plies, and gives its layout back', () => {
    const f = guessFraming(template, nmm)
    expect(f).toMatchObject({ grade: 'o86-spf', stud: '2x6', endPlies: 3, topPlies: 2, bottomPlies: 1, openings: [{ header: '2x10', headerPlies: 2, jackPlies: 1 }] })
    expect(f.over).toBeUndefined()
    expect(f.rim).toMatchObject({ size: 'rim32', grade: 'custom', e: 9000 })
    const back = applyFraming(template, f, nmm)
    expect(back.studs).toEqual(template.studs)
    for (const k of ['topEa', 'topEi', 'bottomEa', 'bottomEi'] as const) expect(back[k]).toBeCloseTo(template[k]!, 6)
    expect(back.openings![0].headerEi).toBeCloseTo(template.openings![0].headerEi, 3)
    expect(back.floor!.rimEa).toBeCloseTo(template.floor!.rimEa, 6)
  })

  it('converts sizes and grades to the model units, and overrides win', () => {
    const f: WallFraming = { grade: 'nds-dfl', stud: '2x4', endPlies: 2, topPlies: 2, bottomPlies: 1, headerGrade: 'lvl', openings: [{ header: 'lvl12', headerPlies: 1, jackPlies: 2 }], over: { bottomEa: 123 } }
    const kipIn = lumberScale({ length: 'in', force: 'kip', time: 's' }, 96)
    const k = framingStiffness(f, kipIn)
    expect(k.studEa).toBeCloseTo(1600 * (38 / 25.4) * (89 / 25.4), 6) // 1.6e6 psi = 1600 ksi
    expect(k.openings[0].headerEi).toBeCloseTo(2000 * (45 / 25.4) * (302 / 25.4) ** 3 / 12, 3)
    expect(k.openings[0].jackEa).toBeCloseTo(2 * k.studEa, 9)
    const l = applyFraming({ ...template, floor: undefined }, f, kipIn)
    expect(l.bottomEa).toBe(123)
    expect(l.studs[0].ea).toBeCloseTo(2 * k.studEa, 9)
    expect(lumberScale(undefined, 96).assumed).toMatchObject({ length: 'in', force: 'kip' })
  })

  it('keeps what sizes cannot reproduce as overrides, and a missing top EI as none', () => {
    const odd = { ...template, bottomEa: 1.234e6, topEi: undefined, floor: undefined }
    const f = guessFraming(odd, nmm)
    expect(f.over).toEqual({ bottomEa: 1.234e6, topEi: 0 })
    const back = applyFraming(odd, f, nmm)
    expect(back.bottomEa).toBe(1.234e6)
    expect(back.topEi).toBeUndefined()
  })
})
