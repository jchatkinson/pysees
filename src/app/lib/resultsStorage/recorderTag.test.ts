import { describe, expect, it } from 'vitest'
import { recorderIdFor, type RecorderPlanKind } from '@/app/lib/carapace/compileInputV1'
import { recorderTagOf } from './recorderRows'

describe('recorder ids', () => {
  // The results viewer finds a target's columns by the tag in its recorder id; a kind it can't strip (camel-cased `studWall`) loses them all.
  it('reads every kind back to its tag', () => {
    const kinds: RecorderPlanKind[] = ['disp', 'vel', 'accel', 'reaction', 'force', 'shell', 'studWall']
    for (const kind of kinds) expect(recorderTagOf(recorderIdFor(kind, 42)), kind).toBe('42')
  })
})
