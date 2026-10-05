# PySees

> **⚠️ Under active development.** PySees is incomplete and evolving rapidly. Features, APIs, and file formats are subject to change without notice, and things may break. Not yet recommended for production or critical work.

## Project Description

PySees is a web-based GUI for building, running, and postprocessing structural models. Models are built parametrically in the browser and analyzed **in the browser** by [Carapace](../carapace), a Rust finite-element engine compiled to WebAssembly. Results are stored locally (IndexedDB) and visualized in the 3D viewport and plots.

OpenSees is optional. Users who want to run their model in OpenSees can export it as an OpenSeesPy script and run it on their own machine. PySees does not run OpenSees, and has no server-side or local-agent compute.

## Goals

- Lower the barrier to entry for structural analysis (and OpenSees) by reducing the programming expertise required to get started.
- Provide a gentle path from traditional structural analysis workflows into OpenSees' code-first environment.
- Make modeling and postprocessing accessible to a broader audience, with nothing to install.
- Reduce repeated setup effort for students and researchers through a core set of reusable modeling and visualization utilities.

## Technical Objectives

- Provide a parametric modeling workflow with schema-driven forms derived from the OpenSeesPy docs.
- Keep scene rendering, analysis input, and script export as pure functions of the model and analysis sequence.
- Run analyses in Web Workers on Carapace wasm, streaming results into IndexedDB so large runs stay responsive.
- Keep exported OpenSeesPy scripts valid and faithful to the model.

## Features

- Parametric model editing with undo/redo: nodes, materials, fiber sections, geometric transforms, elements, supports, load patterns, gridlines and levels, with starter templates.
- Schema-driven command forms for OpenSees command entry.
- Analysis sequence builder (static stages today) compiled to Carapace input.
- In-browser analysis with progress and cancellation.
- 3D viewport with nodes, elements, supports, load glyphs, deformed shape and element force diagrams, with step playback.
- Plot overlay and data tables for recorded channels.
- Material Preview: chart the response of a uniaxial material under a monotonic, cyclic, or custom strain protocol, computed by Carapace.
- Script export as OpenSeesPy or Tcl (`File > Export .py / .tcl`), checked against real OpenSees in the test suite.
- Script import (`File > Import .tcl / .py…`): reads an OpenSees Tcl or OpenSeesPy script into an ordinary PySees model. The script is parsed, not executed.

## Roadmap

1. Broaden Carapace coverage in the compiler: more materials, modal and transient stages, 3D elements.
2. Script export polish: dedicated download flow and Tcl output.
3. Scripting workflow for parametric model generation (see `SCRIPTINGPLAN.md`).
4. Richer results: more force/stress views, reactions, time-history tools.
5. Optional import of recorder output from external OpenSees runs.

## Usage

### Development

1. Install dependencies:
   `npm install`
2. Start local development:
   `npm run dev`
3. Run lint checks:
   `npm run lint`
   Run tests: `npm test`
4. Rebuild the bundled Carapace wasm after engine changes (needs the sibling `../carapace` checkout and `wasm-bindgen`):
   `scripts/build-carapace.sh`
5. Build the app:
   `npm run build`
6. Preview the production build:
   `npm run preview`

Schema-related scripts:
- Extract schema candidates:
  `npm run schema:extract -- --docs-root /tmp/OpenSeesPyDoc --output src/app/generated/opensees-schema-candidates.json`
- Build runtime schemas:
  `npm run schema:build -- --input src/app/generated/opensees-schema-candidates.json --output src/app/generated/commandSchemas.generated.ts --uniaxial-defaults scripts/uniaxial-material-defaults.json`

### OpenSeesPy schema extraction

Use the reusable generator to parse OpenSeesPyDoc RST files and emit command schema candidates.

1. Clone docs locally:
   `git clone https://github.com/zhuminjie/OpenSeesPyDoc /tmp/OpenSeesPyDoc`
2. Run extraction:
   `npm run schema:extract -- --docs-root /tmp/OpenSeesPyDoc --output src/app/generated/opensees-schema-candidates.json`
3. Optional manual corrections:
   `scripts/opensees-schema-overrides.example.json` -> local overrides file, then re-run with `--overrides /path/to/overrides.json`.

Notes:
- Default mode parses only RST function directives (`.. function::`, `.. py:function::`) to avoid prose/citation noise.
- Optional fallback parsing (less strict): add `--include-code-calls` and/or `--include-inline-calls`.
- The extractor also enriches `uniaxialMaterial` candidates with parsed argument metadata from docs tables:
  - short descriptions for UI tooltips
  - required/optional flags (`(optional)` text in docs marks optional; otherwise required)
  - explicit defaults from signatures and `default=...` description text
- The output is a candidate artifact intended for manual review before production use.

### Runtime schema generation

Build normalized runtime schemas from extracted candidates:

`npm run schema:build -- --input src/app/generated/opensees-schema-candidates.json --output src/app/generated/commandSchemas.generated.ts --uniaxial-defaults scripts/uniaxial-material-defaults.json`

This pass:
- normalizes argument names and kinds
- groups literal-first overloads into `choice` schemas
- applies uniaxial doc metadata (description + required/optional + parsed defaults)
- applies curated uniaxial fallback defaults from `scripts/uniaxial-material-defaults.json` when docs do not provide defaults
- emits deterministic TypeScript for direct app import

Recommended regeneration sequence after doc updates:
1. `npm run schema:extract -- --docs-root /path/to/OpenSeesPyDoc --output src/app/generated/opensees-schema-candidates.json`
2. `npm run schema:build -- --input src/app/generated/opensees-schema-candidates.json --output src/app/generated/commandSchemas.generated.ts --uniaxial-defaults scripts/uniaxial-material-defaults.json`

## License

PySees is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Personal, educational, and research use is free. Commercial use — including running or hosting a public instance of the app for others — is not permitted without a separate commercial license.
