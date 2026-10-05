import { describe, it, expect } from 'vitest'
import { exportScript } from '@/app/lib/exportScript'
import { ALL_FIXTURES } from '@/app/lib/commands/testkit'

/** Checked-in exports: any change to what a model prints shows up as a reviewable diff. Update with `vitest -u` only when the change is intended. */
describe.each(['py', 'tcl'] as const)('golden .%s export', (lang) => {
  it.each(ALL_FIXTURES())('$name', async ({ name, model, history }) => {
    await expect(exportScript(model, history, lang)).toMatchFileSnapshot(`__golden__/${name}.${lang}`)
  })
})
