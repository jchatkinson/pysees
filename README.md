# PySees

## OpenSeesPy schema extraction

Use the reusable generator to parse OpenSeesPyDoc RST files and emit command schema candidates.

1. Clone docs locally:
   `git clone https://github.com/zhuminjie/OpenSeesPyDoc /tmp/OpenSeesPyDoc`
2. Run extraction:
   `npm run schema:extract -- --docs-root /tmp/OpenSeesPyDoc --output src/generated/opensees-schema-candidates.json`
   - Default mode parses only RST function directives (`.. function::`, `.. py:function::`) to avoid prose/citation noise.
   - Optional fallback parsing (less strict): add `--include-code-calls` and/or `--include-inline-calls`.
3. Optional manual corrections:
   - Copy `scripts/opensees-schema-overrides.example.json` to a local overrides file.
   - Re-run with `--overrides /path/to/overrides.json`.

The output is intended as a generated candidate artifact for manual review before promoting into production command schemas.

## Runtime schema generation

Build normalized runtime schemas from the extracted candidates:

`npm run schema:build -- --input src/generated/opensees-schema-candidates.json --output src/generated/commandSchemas.generated.ts`

This second pass:
- normalizes argument names/kinds
- groups literal-first overloads into `choice` schemas
- emits deterministic TypeScript for direct app import
