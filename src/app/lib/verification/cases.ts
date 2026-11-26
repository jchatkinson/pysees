import { TEMPLATE_FIXTURES, cantilever3dFixtures, constraintFixtures, plateFixture, shellFixtures, towerFixture, trussFixtures, type Fixture } from '@/app/lib/commands/testkit'
import type { CaseModel, VerificationCase } from './types'
import { SRC, baseShear, disp, pushoverCurve } from './helpers'
import { NEW_CASES } from './newCases'

const fromFixture = (f: () => Fixture) => (): CaseModel => { const x = f(); return { model: x.model, history: x.history, gridlines: x.gridlines, levels: x.levels } }
const named = (list: () => Fixture[], name: string) => fromFixture(() => list().find((f) => f.name === name)!)

/** Wire stage indices of a compiled history are fixed by its blocks; these name the templates' (eigen, gravity, earthquake, reset, gravity, pushover). */
const FRAME_STAGES = { gravity: 1, earthquake: 2, pushover: 5 }
const EXISTING: VerificationCase[] = [
  // Linear elastic
  {
    id: 'cantilever-elastic', category: 'linear', build: fromFixture(() => TEMPLATE_FIXTURES[1]),
    plots: (m) => [{ title: 'Tip load against tip displacement', x: disp(5, 1), y: baseShear(m, 1), xLabel: 'Tip displacement (m)', yLabel: 'Tip load (N)', origin: true }],
    analytical: [{ label: 'PL³/3EI', plot: 0, points: () => [[0, 0], [10e3 * 27 / (3 * 200e9 * 1e-4), 10e3]] }],
    shot: { view: 'front', result: 'M' }, sources: [SRC.elastic, SRC.transform],
  },
  {
    id: 'truss-elastic', category: 'linear', build: named(trussFixtures, 'truss-elastic'),
    plots: (m) => [{ title: 'Apex load against apex deflection', x: disp(3, 2), y: baseShear(m, 2), xLabel: 'Apex vertical displacement (m)', yLabel: 'Vertical load carried (N)', origin: true }],
    shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.elasticLike],
  },
  {
    id: 'cantilever3d-elastic', category: 'linear', build: named(cantilever3dFixtures, 'cantilever3d-elastic'),
    plots: [{ title: 'Tip displacements', x: { q: 'step' }, y: disp(3, 1), xLabel: 'Load step', yLabel: 'Tip X displacement (m)', origin: true }, { title: 'Tip twist', x: { q: 'step' }, y: disp(3, 6), xLabel: 'Load step', yLabel: 'Tip rotation about Z (rad)', origin: true }],
    shot: { view: '3d', result: 'deformed' }, sources: [SRC.elastic, SRC.transform],
  },
  {
    id: 'constraints-2d', category: 'linear', build: named(constraintFixtures, 'constraints-2d'),
    plots: [{ title: 'Tied column tops', x: { q: 'step' }, y: disp(2, 1), xLabel: 'Load step', yLabel: 'Node 2 X displacement (m)', origin: true }, { title: 'Mixed tie (node 7 X follows node 2 Y)', x: disp(2, 2), y: disp(7, 1), xLabel: 'Node 2 Y displacement (m)', yLabel: 'Node 7 X displacement (m)', origin: true }],
    shot: { view: 'front', result: 'deformed' }, sources: [SRC.constraint, SRC.elastic],
  },
  {
    id: 'constraints-3d', category: 'linear', build: named(constraintFixtures, 'constraints-3d'),
    plots: [{ title: 'Diaphragm master', x: { q: 'step' }, y: disp(9, 6), xLabel: 'Load step', yLabel: 'Diaphragm rotation (rad)', origin: true }, { title: 'Point on a rigid link', x: { q: 'step' }, y: disp(12, 3), xLabel: 'Load step', yLabel: 'Node 12 Z displacement (m)', origin: true }],
    shot: { view: '3d', result: 'deformed' }, sources: [SRC.constraint, SRC.elastic],
  },
  // Shells
  {
    id: 'shell-patch', category: 'shells', build: named(shellFixtures, 'shell-patch'),
    plots: [{ title: 'Loaded corner', x: { q: 'step' }, y: disp(5, 3), xLabel: 'Load step', yLabel: 'Node 5 Z displacement', origin: true }, { title: 'Bending moment at a Gauss point', x: { q: 'step' }, y: { q: 'shell', ele: 1, component: 3 }, xLabel: 'Load step', yLabel: 'Mx, element 1, point 1', origin: true }],
    shot: { view: '3d', result: 'contour' }, sources: [SRC.shell4, SRC.shellSection],
  },
  {
    id: 'shell-patch-with-triangle', category: 'shells', build: named(shellFixtures, 'shell-patch-with-triangle'),
    plots: [{ title: 'Triangle tip', x: { q: 'step' }, y: disp(7, 3), xLabel: 'Load step', yLabel: 'Node 7 Z displacement', origin: true }],
    shot: { view: '3d', result: 'contour' }, sources: [SRC.shell4, SRC.shell3, SRC.shellSection],
  },
  {
    id: 'shell-patch-self-weight-pressure', category: 'shells', build: named(shellFixtures, 'shell-patch-self-weight-pressure'),
    plots: [{ title: 'Loaded corner', x: { q: 'step' }, y: disp(6, 3), xLabel: 'Load step', yLabel: 'Node 6 Z displacement', origin: true }],
    shot: { view: '3d', result: 'contour' }, sources: [SRC.shell4, SRC.shellSection],
  },
  {
    id: 'plate', category: 'shells', build: fromFixture(plateFixture),
    plots: [{ title: 'Free-edge deflection', x: { q: 'step' }, y: disp(15, 3), xLabel: 'Load step', yLabel: 'Corner Z displacement (m)', origin: true }, { title: 'Support reaction', x: { q: 'step' }, y: { q: 'reaction', node: 6, dof: 3 }, xLabel: 'Load step', yLabel: 'Node 6 vertical reaction (N)', origin: true }],
    shot: { view: '3d', result: 'contour' }, sources: [SRC.shell4, SRC.shellSection],
  },
  {
    id: 'tower', category: 'shells', build: fromFixture(towerFixture),
    plots: (m) => [{ title: 'Total gravity reaction', x: { q: 'step' }, y: baseShear(m, 3), xLabel: 'Load step', yLabel: 'Vertical reaction (N)', origin: true }],
    shot: { view: '3d', result: 'deformed', extruded: true }, sources: [SRC.shell4, SRC.elastic, SRC.shellSection],
  },
  // Material nonlinearity
  {
    id: 'moment-curvature', category: 'material', build: fromFixture(() => TEMPLATE_FIXTURES[0]),
    plots: [{ title: 'Moment against curvature', x: disp(2, 3), y: { q: 'force', ele: 1, component: 5 }, xLabel: 'Curvature (1/m)', yLabel: 'Moment (N·m)', stages: [1] }],
    shot: { view: 'front', result: 'deformed' }, sources: [SRC.fiber, SRC.steel01, SRC.concrete01],
  },
  {
    id: 'cantilever-disp', category: 'material', build: fromFixture(() => TEMPLATE_FIXTURES[2]),
    plots: (m) => [pushoverCurve(m)],
    shot: { view: 'front', result: 'M' }, sources: [SRC.disp, SRC.fiber, SRC.integration],
  },
  {
    id: 'frame-disp-pinned', category: 'material', build: fromFixture(() => TEMPLATE_FIXTURES[4]),
    plots: (m) => [{ title: 'Roof displacement under the earthquake', x: { q: 'time' }, y: disp(3, 1), xLabel: 'Time (s)', yLabel: 'Roof X displacement (m)', stages: [FRAME_STAGES.earthquake] }, pushoverCurve(m, 'Pushover curve', [FRAME_STAGES.pushover])],
    shot: { view: 'front', result: 'M' }, sources: [SRC.disp, SRC.fiber, SRC.transient],
  },
  {
    id: 'precast-wall', category: 'material', build: fromFixture(() => TEMPLATE_FIXTURES[6]),
    plots: (m) => [pushoverCurve(m, 'Pushover curve', [2])],
    shot: { view: 'front', result: 'deformed' }, sources: [SRC.disp, SRC.zeroLength, SRC.steel02, SRC.concrete02, SRC.elasticLike, SRC.composite],
  },
  {
    id: 'cantilever3d-fiber-pushover', category: 'fiber3d', build: named(cantilever3dFixtures, 'cantilever3d-fiber-pushover'),
    plots: (m) => [pushoverCurve(m)],
    shot: { view: '3d', result: 'deformed', extruded: true }, sources: [SRC.disp, SRC.fiber, SRC.steel01, SRC.concrete01],
  },
  ...['yielding', 'concrete02', 'hysteretic', 'pinching4', 'parallel', 'series', 'minmax'].map((k): VerificationCase => ({
    id: `truss-${k}`, category: 'material', build: named(trussFixtures, `truss-${k}`),
    plots: (m) => [pushoverCurve(m, 'Apex load against apex deflection')],
    shot: { view: 'front', result: 'N' },
    sources: [SRC.truss, ...({ yielding: [SRC.steel01], concrete02: [SRC.concrete02], hysteretic: [SRC.hysteretic], pinching4: [SRC.pinching4], parallel: [SRC.composite, SRC.steel01], series: [SRC.composite, SRC.steel01], minmax: [SRC.composite, SRC.steel01] } as Record<string, string[]>)[k]],
  })),
  // Dynamics (the frame templates also run gravity and a pushover)
  {
    id: 'frame-elastic', category: 'dynamics', build: fromFixture(() => TEMPLATE_FIXTURES[3]),
    plots: (m) => [{ title: 'Roof displacement under the earthquake', x: { q: 'time' }, y: disp(7, 1), xLabel: 'Time (s)', yLabel: 'Roof X displacement (m)', stages: [FRAME_STAGES.earthquake] }, { title: 'Roof acceleration (relative)', x: { q: 'time' }, y: { q: 'accel', node: 7, dof: 1 }, xLabel: 'Time (s)', yLabel: 'Roof X acceleration (m/s²)', stages: [FRAME_STAGES.earthquake] }, pushoverCurve(m, 'Pushover curve', [FRAME_STAGES.pushover])],
    shot: { view: 'front', result: 'M' }, sources: [SRC.elastic, SRC.transient, SRC.damping, SRC.groundMotion, SRC.modal],
  },
  {
    id: 'frame3d-elastic', category: 'dynamics', build: fromFixture(() => TEMPLATE_FIXTURES[5]),
    plots: (m) => [{ title: 'Roof displacement, two-component earthquake', x: { q: 'time' }, y: disp(18, 1), xLabel: 'Time (s)', yLabel: 'Roof corner X displacement (m)', stages: [FRAME_STAGES.earthquake] }, { title: 'Roof displacement in Y', x: { q: 'time' }, y: disp(18, 2), xLabel: 'Time (s)', yLabel: 'Roof corner Y displacement (m)', stages: [FRAME_STAGES.earthquake] }, pushoverCurve(m, 'Pushover curve', [FRAME_STAGES.pushover])],
    shot: { view: '3d', result: 'deformed', extruded: true }, sources: [SRC.elastic, SRC.transient, SRC.damping, SRC.groundMotion, SRC.modal],
  },
]

export const CASES: VerificationCase[] = [...EXISTING, ...NEW_CASES]
