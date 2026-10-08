import { describe, expect, it } from 'vitest'
import { memberFrame } from '@/app/lib/memberFrame'

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))

describe('memberFrame', () => {
  it('2D: y is x turned 90° counter-clockwise, z is global Z', () => {
    const f = memberFrame([0, 0], [0, 3], 2)!
    close(f.x, [0, 1, 0]); close(f.y, [-1, 0, 0]); close(f.z, [0, 0, 1])
  })

  it('3D follows OpenSees: y = vecxz × x, z = x × y', () => {
    const column = memberFrame([0, 0, 0], [0, 0, 3], 3, [1, 0, 0])!
    close(column.x, [0, 0, 1]); close(column.y, [0, -1, 0]); close(column.z, [1, 0, 0])
    const beam = memberFrame([0, 0, 3], [4, 0, 3], 3, [0, 0, 1])!
    close(beam.x, [1, 0, 0]); close(beam.y, [0, 1, 0]); close(beam.z, [0, 0, 1])
  })

  it('3D without a usable vecxz: Z-up, so vertical members take X and the rest take Z', () => {
    close(memberFrame([0, 0, 0], [0, 0, 2], 3)!.z, [1, 0, 0])
    close(memberFrame([0, 0, 0], [2, 0, 0], 3, [1, 0, 0])!.z, [0, 0, 1]) // vecxz parallel to the member
  })

  it('a zero-length member has no frame', () => {
    expect(memberFrame([1, 1, 1], [1, 1, 1], 3)).toBeNull()
  })
})
