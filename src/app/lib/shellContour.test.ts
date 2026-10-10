import { describe, expect, it } from 'vitest'
import { extrapolateToCorners } from '@/app/lib/shellContour'

describe('shell contour extrapolation', () => {
  it('keeps a constant field constant', () => {
    expect(extrapolateToCorners([2, 2, 2, 2], 4).every((v) => Math.abs(v - 2) < 1e-12)).toBe(true)
    expect(extrapolateToCorners([2, 2, 2, 2], 3).every((v) => Math.abs(v - 2) < 1e-12)).toBe(true)
  })
  it('reproduces a bilinear field at the corners of a quad', () => {
    const g = 1 / Math.sqrt(3)
    const f = (s: number, t: number) => 3 + 2 * s - t + 0.5 * s * t
    const points: [number, number][] = [[-g, -g], [g, -g], [g, g], [-g, g]]
    const corners = extrapolateToCorners(points.map(([s, t]) => f(s, t)), 4)
    ;([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]).forEach(([s, t], k) => expect(corners[k]).toBeCloseTo(f(s, t), 12))
  })
  it('reproduces a linear field at the corners of a triangle', () => {
    // f = 1 + 2 L1 - 3 L2 + 0.5 L3 at the Gauss points (area coordinates), recorder order.
    const f = (l: number[]) => 1 + 2 * l[0] - 3 * l[1] + 0.5 * l[2]
    const gauss = [[1 / 3, 1 / 3, 1 / 3], [0.2, 0.6, 0.2], [0.6, 0.2, 0.2], [0.2, 0.2, 0.6]].map(f)
    const corners = extrapolateToCorners(gauss, 3)
    expect(corners[0]).toBeCloseTo(f([1, 0, 0]), 12)
    expect(corners[1]).toBeCloseTo(f([0, 1, 0]), 12)
    expect(corners[2]).toBeCloseTo(f([0, 0, 1]), 12)
  })
})
