# Scripting Plan (Deferred)

Last revised against the entity-map `Model` architecture (the original draft assumed a `Command[]` history with a `SCRIPT_GROUP` command; that model no longer exists).

## Goal
A lightweight Python-like language for parametric model generation (grids, repeated bays/stories, batch nodes), whose output is ordinary `Model` entities. Reused for batch UI entry (multi-node creation).

## Where it fits today
- The `Model` is maps of typed entities with app-managed IDs, edited through `ModelWrite` / `applyModelWrite` (`lib/modelWrite.ts`). Undo/redo is a snapshot stack, so one script run = one snapshot.
- Export (`lib/exportScript.ts`) and Carapace compile (`lib/carapace/compileInputV1.ts`) read entities only. Script output that lands as plain entities needs **no** export or compile changes, and exported `.py` never contains DSL text.
- Existing pieces to reuse rather than rebuild:
  - `lib/scriptImport/expr.ts`: constant substitution and arithmetic (`expr`, `math.*`).
  - `lib/commands/decode.ts` + `grammar.ts`: positional args to `ModelWrite`, with validation against the schemas. A scripted call `node(1.0, 2.0)` can go through the same decoder as an imported `ops.node(...)`.
  - `lib/scriptImport/build.ts`: builds a `Model` from decoded writes, with diagnostics.
- Scripting differs from import in one way: import is a static reader that skips `for`/`if`/`proc`; scripting must actually evaluate `for` loops over `range(...)`.

## MVP Language Surface
- Assignment: `name = expr`
- `for` over `range(...)` and over list literals
- List literals, arithmetic (`+ - * / **`, parentheses), `math.*`
- Calls named after the OpenSeesPy commands (`node`, `element`, `fix`, `load`, ...), decoded via `commands/decode.ts`

## Non-Goals (MVP)
`if`, function definitions, classes, imports, any host API (filesystem, network).

## Open Decision: persistence
How does a script survive after it has produced entities? Pick one before building.
1. **Fire-and-forget**: run, write entities, discard source. Simplest; batch node entry is just a loop that emits writes. No editable parametric model.
2. **Generator entity**: add a `script` kind to `Model` holding `source` and the IDs it produced; re-running replaces exactly those entities. Gives the "editable parametric batch" the original plan wanted, but needs ID ownership, deletion of generated entities, and import/export treatment (export flattens; import can't recover the source).

Recommendation: start with 1 (it covers batch node entry and is a prerequisite for 2), and only add 2 if users ask to re-edit generated geometry.

## Implementation Plan
1. **Core** (`lib/scriptLang/{tokenize,parse,eval}.ts`): tokenizer, AST for assignment/for/expression/call, deterministic evaluator emitting `ModelWrite[]` plus diagnostics with line/column. IDs allocated from `model.nextIds`.
2. **Store integration**: run script, and if no errors apply all writes as a single undo snapshot; on error, no mutation and show diagnostics.
3. **UI**: a Script mode alongside the schema form in the right panel (`CommandForm`): textarea, Run, inline diagnostics.
4. **Batch entry**: node `Single` / `Multiple` tabs; `Multiple` is a coordinate table that generates and runs a script (or emits writes directly under option 1).
5. **Regression pass**: scripted models through `roundtrip.test.ts`, `golden.test.ts` and `opensees.test.ts` fixtures.

## Tests
- Parser: assignments, loops, lists, precedence, syntax errors with line/column.
- Evaluator: emitted writes, deterministic IDs, invalid-argument diagnostics (reusing grammar validation).
- Store: one run = one undo step; failed run leaves the model untouched.
- UI: node `Multiple` creates all nodes in one undo step; errors are non-destructive.

## Open Decision: syntax
Strict Python indentation blocks, or an explicit terminator (`end`) to simplify parsing. Indentation matches the OpenSeesPy users already write; the terminator is cheaper to parse.
