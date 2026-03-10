# PySees

## Project Description

PySees is a web-based GUI preprocessor/postprocessor for OpenSeesPy structural models.  
It does not run OpenSees in the browser. Instead, users build parametric models from command history, export a Python script, run analysis externally on their local machine, and import recorder results back for visualization. Further integration with opensees may be possible in the future, if licensing requirements are permissive, but that has not yet been investigated. 

## Goals

- Lower the barrier to entry for OpenSees by reducing the amount of programming expertise required to get started.
- Provide a gentle path into OpenSees by bridging traditional structural analysis workflows with its code-first environment.
- Expand OpenSees adoption by making modeling and postprocessing more accessible to a broader audience.
- Reduce repeated setup effort for students and researchers through a core set of reusable modeling and visualization utilities.

## Technical Objectives

- Provide a history-based, parametric modeling workflow for OpenSeesPy.
- Keep scene rendering and script export as pure functions of command history replay.
- Support script-assisted model generation for repetitive geometry and loading patterns.
- Enable lightweight postprocessing from imported recorder files.

## Features

- Immutable command history with undo/redo and replay-derived model state.
- Schema-driven command forms for OpenSees command entry.
- 3D viewport with nodes/elements/supports/load glyphs.
- View controls for IDs and visibility toggles.
- Python export pipeline target (`openseespy.opensees` script output).

## Roadmap

1. Complete V1 model pipeline: model/node/fix/load/timeSeries/pattern/geomTransf/basic elements.
2. Add scripting workflow (`SCRIPT_GROUP`) for parametric command generation.
3. Implement robust Python exporter and round-trip validation.
4. Expand results mode: deformed shape, time history plotting, force/reaction views.
5. Improve large-recorder import path with chunked parsing and worker-based processing.

## Usage

### Development

1. Install dependencies:
   `npm install`
2. Start local development:
   `npm run dev`
3. Run lint checks:
   `npm run lint`
4. Build the app:
   `npm run build`
5. Preview the production build:
   `npm run preview`

Schema-related scripts:
- Extract schema candidates:
  `npm run schema:extract -- --docs-root /tmp/OpenSeesPyDoc --output src/generated/opensees-schema-candidates.json`
- Build runtime schemas:
  `npm run schema:build -- --input src/generated/opensees-schema-candidates.json --output src/generated/commandSchemas.generated.ts --uniaxial-defaults scripts/uniaxial-material-defaults.json`

### OpenSeesPy schema extraction

Use the reusable generator to parse OpenSeesPyDoc RST files and emit command schema candidates.

1. Clone docs locally:
   `git clone https://github.com/zhuminjie/OpenSeesPyDoc /tmp/OpenSeesPyDoc`
2. Run extraction:
   `npm run schema:extract -- --docs-root /tmp/OpenSeesPyDoc --output src/generated/opensees-schema-candidates.json`
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

`npm run schema:build -- --input src/generated/opensees-schema-candidates.json --output src/generated/commandSchemas.generated.ts --uniaxial-defaults scripts/uniaxial-material-defaults.json`

This pass:
- normalizes argument names and kinds
- groups literal-first overloads into `choice` schemas
- applies uniaxial doc metadata (description + required/optional + parsed defaults)
- applies curated uniaxial fallback defaults from `scripts/uniaxial-material-defaults.json` when docs do not provide defaults
- emits deterministic TypeScript for direct app import

Recommended regeneration sequence after doc updates:
1. `npm run schema:extract -- --docs-root /path/to/OpenSeesPyDoc --output src/generated/opensees-schema-candidates.json`
2. `npm run schema:build -- --input src/generated/opensees-schema-candidates.json --output src/generated/commandSchemas.generated.ts --uniaxial-defaults scripts/uniaxial-material-defaults.json`

## Local Agent (material preview MVP)

PySees can connect to a local Go agent for live material hysteresis preview without running OpenSees on the server.

### Build agent

```bash
cd agent
/usr/local/go/bin/go build ./cmd/pysees-agent
```

### Run agent

```bash
cd agent
./pysees-agent
```

The agent binds to the first free localhost port in: `8765, 8766, 8767, 8768`.

### Connect from app

In Studio: `File > Connect to local instance`.

Current contract:
- `GET /health`
- `POST /v1/session`
- `GET /v1/ws?token=...`
