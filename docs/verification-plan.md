# Verification: plan and spec

Two goals:

1. **More coverage.** Compare the features Carapace compiles but no test runs against OpenSees (geometric nonlinearity, 3D fiber
   members, cyclic materials, solver options, shell dynamics).
2. **A public verification page** at `/verification` on the site. One page per problem, each with a description, a screenshot of the
   model, plots of Carapace and OpenSees results on top of each other, the measured agreement, and links to the exported script and the
   project file. Vitest output stays in the test suite. This page is the version written for people.

Both come from **one registry of verification cases**. The vitest suite asserts agreement on every case. A separate generator runs the
same cases and writes the data the page shows. The page never has a case the tests don't check, and the reverse is also true.

---

## Status (2026-11-25): implemented

All four planned pieces exist: the case registry (55 cases), the generator with freshness and pin checks, `/studio?open=`, the screenshot
script and the `/verification` pages. Phase 4 (running a case live in the browser) is not built.

What the new comparisons found, and what was done about each:

| Finding | Where | Resolution |
|---|---|---|
| A 2D fiber member ignored its geomTransf: Corotational and PDelta were dropped with no diagnostic | PySees compiler | Corotational now reaches Carapace; PDelta on a fiber member warns |
| Every pushover froze its reference pattern afterwards, so a second push on the same pattern had no reference load (OpenSees calls no `loadConst` there) | PySees compiler | A pushover holds nothing unless asked |
| A static stage restarted the load factor at 0; OpenSees keeps the domain time across `analyze` calls | Carapace session | Carried over unless the stage held loads, or a reset or transient came between (carapace `d6bed33`) |
| `ModifiedNewton` was compiled to the *initial* tangent; OpenSees' default reforms it at the start of each step | PySees compiler | `reuseAtStepStart` |
| Mode shapes carried the Lanczos seed at massless DOFs (frequencies were right) | Carapace modal | One inverse-iteration step per Ritz vector (carapace `d6bed33`) |
| Recorder files mixing 4-node and 3-node shells were parsed with one width per element | PySees export | One file per shell type in a mixed group |
| `-jntOffset` in 2D and `sp` loads were dropped silently | PySees compiler | Warnings; `carapace/unsupported.test.ts` covers every unsupported input |
| P-Delta: consistent geometric stiffness vs OpenSees' chord term | Carapace (documented choice) | Known difference, 5% |
| Shell modal: lumped vs consistent mass | Carapace (documented choice) | Known difference, 15% |
| Record starting at non-zero acceleration: consistent a₀ vs a₀ = 0 | Carapace (documented choice) | Known difference |
| Corotational local end shear: chord length vs undeformed length | Reporting convention | Known difference on element forces only |

Open:

- A second displacement-controlled push on a *new* pattern without holding the first: OpenSees ends it out of equilibrium (pattern factor
  equals the domain time but the reactions don't match), so it is listed as not verified. PySees could hold earlier pushover patterns when
  a later block pushes a different one.
- The 2D fiber Euler column did not converge in either engine from a straight start (dropped).
- Base UI logs a `nativeButton` warning for the header's "Open Studio" link (pre-existing).

## Current state (Nov 2026)

- `carapaceVsOpenSees.test.ts` runs the fixtures in `commands/testkit.ts` through Carapace and real OpenSeesPy (`.venv`). It compares
  disp / reaction / force / shell columns step by step at a relative tolerance of 1e-5 against the largest OpenSees value.
- `modalVsOpenSees.test.ts` compares eigen frequencies only. `transient.test.ts` compares ground-motion runs, including vel and accel.
  `zeroLength`, `fiberCentroid` and `shellModifiers` have small comparisons of their own.
- None of these are visible outside the terminal.

### Gaps, by priority

| # | Feature | Compiled? | Compared today |
|---|---------|-----------|----------------|
| 1 | 2D `PDelta`, 2D `Corotational` (elastic and fiber), 3D `PDelta` | yes | no (only `Linear`) |
| 2 | 3D fiber: biaxial bending, axial load with bending, `-GJ` torsion, rotated `vecxz`, element loads, Lobatto, transient | yes | one column, one load in X, Legendre 3 |
| 3 | Cyclic material response (unloading, reloading, pinching, Bauschinger, crack reopening) | yes | monotonic pushes only |
| 4 | Algorithms other than Newton; NormUnbalance / EnergyIncr | yes | no |
| 5 | Shell mass in modal and transient | yes (lumped) | no |
| 6 | Element mass (`rho` / `mass`) in modal | yes | one transient cantilever |
| 7 | 2D `zeroLengthSection` in a frame, with `-orient` | yes | moment-curvature only |
| 8 | Shell element forces under pressure | yes | skipped |
| 9 | Mode shapes and participation | yes | frequencies only |
| 10 | vel / accel on the template earthquake runs | yes | not compared in the main suite |
| 11 | Stud walls, diaphragms, joist floors | Carapace-only | total-reaction check on an approximate export |
| 12 | Diagnostics for unsupported input (3D Corotational, `-jntOffset`, `forceBeamColumn`, 3D `zeroLengthSection`, other integrations, non-rect patches, `sp`) | diagnostic | not asserted |

---

## Spec

### 1. Case registry: `src/app/lib/verification/`

```ts
// cases.ts
export interface VerificationCase {
  id: string                        // URL slug, e.g. 'pdelta-portal-2d'
  category: CategoryId              // see the categories below
  model: () => Model                // built from ModelWrites (testkit helpers)
  history: AnalysisHistory
  /** Quantities the assertion skips, with the reason (shown on the page). */
  skip?: { quantity: Quantity; why: string }[]
  /** Tolerance override; default RTOL = 1e-5. A looser one needs `why`. */
  rtol?: { value: number; why: string }
  /** Modal cases: compare frequencies (and, later, shapes) instead of recorder columns. */
  modal?: { modes: number }
  /** The curves the page plots. The assertion always covers every recorded column. */
  plots: PlotSpec[]
  /** Optional closed-form reference drawn as a third line (e.g. PL³/3EI, Euler load). */
  analytical?: { label: string; plot: number; points: (x: number) => number } 
  /** How the screenshot script frames the model (see section 4). */
  shot: ShotSpec
  /** Carapace source files the case exercises (repo-relative), linked from the case page at the recorded commit. */
  sources: string[]
}

type Signal =
  | { q: 'disp' | 'vel' | 'accel' | 'reaction'; node: number; dof: number }
  | { q: 'force'; ele: number; component: number }
  | { q: 'shell'; ele: number; component: number }
  | { q: 'time' | 'step' | 'lambda' }               // lambda = the pattern's load factor
  | { sum: Signal[]; scale?: number }              // e.g. base shear = −Σ reactions
interface PlotSpec { title: string; x: Signal; y: Signal; xLabel: string; yLabel: string; kind?: 'line' | 'hysteresis' }
```

- Existing fixtures (`TEMPLATE_FIXTURES`, `trussFixtures`, `cantilever3dFixtures`, `shellFixtures`, `plateFixture`, `towerFixture`,
  `constraintFixtures`) move into the registry. `testkit.ts` keeps the builders. `ALL_FIXTURES` for round-trip tests stays where it is.
- `carapaceVsOpenSees.test.ts` becomes `it.each(CASES)` over the registry. `modalVsOpenSees` and the OpenSees halves of `transient`
  move in when they become cases. Tests that probe edge behaviour (diagnostics, invalid input) stay where they are.
- `comparison.ts` gains `signal(run | files, Signal)`, which reads one series from either engine. The page and the assertion use the
  same lookup, so a plotted curve is always one that was checked.
- Units: cases stay unitless or SI as today. A case may set `model.config.units`, so the page labels its axes.

### 2. Generator: `src/app/lib/verification/generate.test.ts`

Gated like the perf suite: `VERIFY=1 npx vitest run src/app/lib/verification`. It needs the `.venv` OpenSeesPy. For every case it writes
to `public/verification/`:

- `<id>.json`: the case's result record (below).
- `<id>.py`: the exported OpenSeesPy script, exactly what OpenSees ran (a download link on the page).
- `<id>.pysees.py`: the saved project (`serializeProject`), so "Open in PySees" loads the case in the studio.

Plus `index.json`: the date, the Carapace commit and the wasm SHA-256, the OpenSeesPy version (`ops.version()`), and one summary row per
case.

```ts
interface CaseResult {
  id: string
  generated: string                       // ISO date
  steps: { carapace: number; opensees: number }
  metrics: Record<Quantity, { compared: number; scale: number; maxAbs: number; maxRel: number }>   // from compareRuns, full data
  modal?: { carapace: number[]; opensees: number[]; maxRel: number }
  plots: { title: string; xLabel: string; yLabel: string; kind: string; carapace: [number, number][]; opensees: [number, number][]; analytical?: [number, number][] }[]
  pass: boolean                           // every metric below its rtol
}
```

- Metrics are computed on the full data. Plot series are downsampled to 400 points at most (largest-triangle-three-buckets, so peaks
  survive). The page shows the full-data numbers.
- The files are committed. The site is static and prerendered, and OpenSees can't run in the browser.
- **Freshness check** (part of `npm test`, no OpenSees needed): every registry id has a `<id>.json` and vice versa, every committed
  result has `pass: true`, and `index.json`'s wasm hash equals the bundled wasm's. A stale hash fails with "run `VERIFY=1 …` and commit
  `public/verification`". Rebuilding the wasm then forces the page to be regenerated.

### 3. Studio: open a project from a URL

`/studio?open=/verification/<id>.pysees.py` fetches the file and loads it through `parseProject` / `loadProject`. Only same-origin
paths are accepted. The existing open-project confirmation still applies if the user has a model. This is the "Open in PySees" button,
and it is how the screenshot script loads a case. No new loader is needed.

### 4. Screenshots: `scripts/verification-screenshots.mjs`

This follows `docs-screenshots.mjs` (Playwright, swiftshader, needs a running dev server). For each case:
`/studio?open=…` → run in Carapace → two captures in `public/verification/`:

- `<id>-model.webp`: the model, extruded view, supports and loads shown.
- `<id>-result.webp`: the result named by `shot.result` at `shot.step`, e.g. the deformed shape at the last step, a moment diagram, a
  shell contour.

```ts
interface ShotSpec { view: '3d' | `plan:${string}` | `elevation:${string}`; result: 'deformed' | 'N' | 'V' | 'M' | 'contour'; step?: 'last' | 'peak' | number; scale?: number }
```

The script reads each case's `shot` from a JSON the generator writes beside `index.json`, so the `.mjs` doesn't import TypeScript.
Captures are 1200×750 at dpr 2, cropped to the viewport, webp.

### 5. Website: `/verification` and `/verification/:id`

Location: `src/marketing/verification/`, beside `docs/`. Descriptions are markdown in `content/<id>.md` with frontmatter
(`title`, `description`, `order`, `features` a comma list), read with the docs' `parseFrontmatter`. Prose stays out of app code, and the
marketing bundle never imports the app's model code. A test requires one md per registry case.

**Index page**
- Intro: what is compared (the same exported model in both engines, every recorded value, every step), the tolerance and what it means,
  the engine versions and date from `index.json`, and a link to `differences.md`.
- A summary table grouped by category: case, features covered (chips), steps, the worst relative difference, and a pass mark. Each row
  links to its case page.
- **Not verified, by design**: stud walls, diaphragms, joist floors and zeroLength friction, with one sentence each on why. Saying so
  openly reads better than leaving them out.

**Case page**
- The title, the description (problem, geometry, loading, why it matters, what it exercises), and the two screenshots side by side.
- Plots (recharts): Carapace as a solid line, OpenSees as hollow markers at every n-th point, the analytical reference dashed when
  present. A hysteresis plot uses a square aspect.
- A metrics table: one row per quantity, with columns compared, scale, max |diff|, max relative diff. For modal cases, a frequency table
  with mode, Carapace, OpenSees and relative difference.
- Skipped quantities, each with its `why`.
- Links: Open in PySees, download the OpenSeesPy script, the case definition in PySees, and the Carapace element and material source,
  each at its recorded commit (see Decisions).
- Added to `marketingRoutes`, `prerender.mjs` (the route list comes from `index.json`) and `seo.ts` (title, description, OG image =
  `<id>-model.webp`). The marketing header and the Carapace page ("Built to match OpenSees") link to `/verification`. `differences.md`
  links there in place of its prose claim of agreement.

### 6. Categories and cases

Existing cases (E) and new ones (N). The new ones are what the coverage work adds, in priority order within each group.

**Linear elastic**
- E `cantilever-elastic`, `frame-elastic`, `frame3d-elastic`, `cantilever3d-elastic`, `constraints-2d`, `constraints-3d`, `truss-elastic`.
- N analytical overlays on the cantilevers (tip displacement PL³/3EI, wL⁴/8EI).

**Shells**
- E `shell-patch`, `shell-patch-with-triangle`, `shell-patch-self-weight-pressure`, `plate`, `tower`.
- N shell forces under pressure: add the exported nodal loads back before comparing and remove the `force` skip (gap 8).

**Material nonlinearity**
- E `moment-curvature`, `cantilever-disp`, `frame-disp-pinned`, `precast-wall`, `truss-yielding`, `truss-concrete02`, `truss-hysteretic`,
  `truss-pinching4`, `truss-parallel`, `truss-series`, `truss-minmax`.
- N `truss-<material>-cyclic`: a displacement-controlled protocol with growing amplitude (three cycles, then ±2×, then ±4× the yield
  displacement) for Steel01, Steel02, Concrete02, Hysteretic, Pinching4, ElasticPP, ENT. Hysteresis plots (gap 3). Needs a cyclic
  pushover protocol. If the pushover block can't reverse yet, add a `Path` displacement series to the existing block, mirrored in the
  export.
- N `zls-hinge-frame`: a 2D frame with `zeroLengthSection` base hinges and `-orient` (gap 7).

**Geometric nonlinearity** (gap 1)
- N `pdelta-portal-2d`: an elastic portal under gravity and then a lateral push. Plot base shear against drift for PDelta and Linear,
  where both engines must show the reduced stiffness. Analytical reference: the stiffness reduced by P/h.
- N `corot-cantilever-2d`: an elastic cantilever under a large tip load (deflection of order L/3). Plot load against tip u and v.
  Analytical reference: the elastica (tabulated).
- N `corot-euler-column-2d`: a pinned column with a small imperfection, pushed past the Euler load. The plot should show the axial load
  levelling off at π²EI/L².
- N `pdelta-fiber-frame-2d`: the fiber frame pushover with PDelta, where the plot should show the softening branch.
- N `corot-fiber-cantilever-2d`: a fiber cantilever with Corotational.
- N `pdelta-frame-3d`: `frame3d-elastic` with PDelta columns, pushed in X and Y.

**3D fiber members** (gap 2)
- N `fiber-column-biaxial-3d`: a column under constant axial load with a lateral push at 45°, with `-GJ` and a torque. Plot the
  interaction path (My against Mz).
- N `fiber-frame-3d`: a 1×1×2 fiber frame with columns at mixed `vecxz` and beams with 3D element loads, under gravity and then a push.
  Lobatto with 5 points.
- N `fiber-frame-3d-earthquake`: the same frame under the two-component record.

**Dynamics**
- E `frame-elastic`, `frame3d-elastic` and `frame-disp-pinned` already run eigen → earthquake → pushover. Make vel and accel part of
  their comparison (gap 10).
- E modal: the 2D and 3D massed frames from `modalVsOpenSees` become cases with a frequency table. Mode shapes are compared after
  normalising and fixing the sign (gap 9).
- E transient: the cantilever ground motion, the response after the record ends, the PEER record, and anchor-period damping from
  `transient.test.ts`.
- N `element-mass-modal`: frames with mass from `rho` / `mass` only (gap 6).
- N `plate-modal` and `plate-earthquake`: shell mass (gap 5). Carapace lumps shell mass, so first decide whether OpenSees gets
  `-lMass` or the case carries a looser `rtol` with its `why`. Prefer `-lMass` if OpenSees' shells honour it.

**Solution procedures** (gap 4)
- N `algorithms`: `frame-disp-pinned`'s pushover under each of ModifiedNewton, KrylovNewton, NewtonLineSearch and Linear (elastic
  only), and each test (NormUnbalance, EnergyIncr). This is one case page with a table of runs. In the registry it is one case per
  combination, grouped by a shared `group` key so the page folds them together.

**Not on the page**
- Diagnostics for unsupported input (gap 12) go in `compileInputV1` tests: one assertion per item that a diagnostic is raised and
  nothing falls back without a warning. They are not comparisons.
- Stud walls etc. (gap 11) are listed as not verified. A possible later case is the load each support carries in the shell export
  against Carapace's wall model, with a stated loose tolerance. That would be a separate "approximate export" section.

### 7. Optional, later: run the case live in the browser

The case page could have a "Run Carapace here" button. It loads the bundled wasm, runs the case in a worker and draws the live
Carapace curve over the committed OpenSees one. Visitors would see a result computed in their own browser that agrees with OpenSees.
It reuses `carapaceWorkerClient`. This is a size question: the wasm would load only when the button is pressed.

---

## Plan

**Phase 1: registry and generator (no new cases, no UI)**
0. `requirements-verify.txt` pinning `openseespy==3.7.1.2`, plus the README line on creating the venv.
1. `verification/cases.ts` with the registry. Move the existing fixtures in and give each one `plots` and `shot`.
2. Add `signal()` to `comparison.ts`. Make `carapaceVsOpenSees.test.ts` iterate the registry. Fold modal and transient comparisons in as
   cases.
3. `generate.test.ts` (VERIFY=1), writing `public/verification/*.json|.py`. Freshness test in `npm test`.
4. Make vel and accel part of the comparison for transient cases (gap 10).

**Phase 2: page with the existing cases**
5. `/studio?open=` (same-origin project URL).
6. `scripts/verification-screenshots.mjs`, and capture every case.
7. `src/marketing/verification/`: index and case pages, content markdown for every existing case, routes, prerender, SEO, links from
   the header, the Carapace page and `differences.md`.

**Phase 3: new coverage, in priority order.** For each one: fixture → assertion passes (or a Carapace bug is found and fixed) → case
markdown → regenerate → screenshots.
8. Geometric nonlinearity (6 cases).
9. 3D fiber (3 cases).
10. Cyclic materials, which may need the cyclic protocol first.
11. Algorithms and convergence tests.
12. Element mass and shell dynamics, mode shapes, shell forces under pressure, `zeroLengthSection` frame.
13. Diagnostic assertions (gap 12; test-only).

**Wording fix (Carapace repo, any time):** "WebAssembly-native" overstates it, since Carapace is a Rust library that also builds
natively. Change it to "WebAssembly-ready" in `../carapace/README.md:5`, and in `../carapace/docs-site/index.html:6` (meta description)
and `:144` (tagline). `docs/obsolete/implementation-plan.md` is archived; leave it. The verification page's intro uses the new wording.

**Phase 4 (optional):** live in-browser run on case pages.

Expect Phase 3 to turn up real disagreements: Corotational and PDelta stiffness terms, 3D fiber torsion coupling, and the cyclic rules
for Pinching4 and Concrete02 are all likely places. If a case fails, fix Carapace and rebuild the wasm. If OpenSees behaves differently
by design, the case gets a `why` and a mention in `differences.md`. Don't loosen a tolerance to make a case pass.

## Decisions

- **Known differences are published.** A case that disagrees for a known reason (e.g. shell lumped mass) appears on the page with
  its looser `rtol` and the `why`. The index marks it "agrees within ×" instead of a plain pass, and links to `differences.md`.
  The freshness test's "every committed result passes" means each result is within its own declared tolerance.
- **Source links.** Both repos are public, and pysees.app deploys from `main`. Each case page links:
  - the case definition in PySees: `https://github.com/jchatkinson/pysees/blob/<commit>/src/app/lib/verification/cases.ts#L<line>`.
    The generator records the commit and the case's line in `<id>.json`, so the link points at the code that produced the numbers.
  - the Carapace source of the element(s) and material(s) the case exercises, at the Carapace commit recorded in `index.json`
    (`https://github.com/jchatkinson/carapace/tree/<commit>/…`). Each case lists these as `sources: string[]` (repo-relative paths).
  - the exported script, and Open in PySees (`https://pysees.app/studio?open=…`).
- **OpenSees version is pinned.** Add `requirements-verify.txt` with `openseespy==3.7.1.2` (the version in today's `.venv`), and a
  README line on creating the venv from it (`uv venv && uv pip install -r requirements-verify.txt`). The generator refuses to write
  results if `ops.version()` (or the installed package version) differs from the pin. The comparison tests only warn, so a
  different local build doesn't block `npm test`. Updating OpenSees means bumping the pin and regenerating the page in the same
  commit.
