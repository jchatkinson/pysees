# Scripting Plan (Deferred)

## Goal
Implement a lightweight Python-like scripting language that compiles to regular `Command[]` entries and is stored as a single `SCRIPT_GROUP` history command. Reuse this path for batch UI entry (starting with multi-node creation).

## Architecture Direction
- Keep `CommandHistory` model unchanged.
- Represent scripted actions as one `SCRIPT_GROUP` command with:
  - `source` (editable script text)
  - `commands` (compiled flat child commands)
- Continue using replay flattening for `SCRIPT_GROUP` so viewport/model update remains automatic.
- During Python export, flatten script-group child commands and emit normal OpenSeesPy calls only.

## MVP Language Surface
- Variable assignment: `name = expr`
- `for` loops over `range(...)`
- List literals: `[ ... ]`
- Command calls: `node(...)`, `fix(...)`, `load(...)`, `element(...)`, etc.
- Arithmetic expressions: `+`, `-`, `*`, `/`, parentheses

## Explicit Non-Goals (MVP)
- No `if`
- No function definitions
- No classes
- No imports
- No host APIs / filesystem / network access

## Implementation Plan

### 1. Script Language Core
Add a small parser/interpreter pipeline:
- `src/lib/scriptLang/tokenize.ts`
- `src/lib/scriptLang/parse.ts`
- `src/lib/scriptLang/eval.ts`

Responsibilities:
- Tokenizer: identifiers, numbers, punctuation, operators, newline/indent handling.
- Parser: build AST for assignment, loop, expression, and call statements.
- Evaluator: execute AST in a deterministic context and emit `Command[]`.

### 2. Runtime Context and Emission
Evaluation context should include:
- `ndm`, `ndf`
- read-only view of existing nodes
- deterministic ID allocation based on current `ModelState` (`nextNodeId`, `nextEleId`, etc.)

Emitter functions map script calls to existing command types so downstream validation/replay remains consistent.

### 3. Store + History Integration
- Insertion path: compile script -> if success, insert `SCRIPT_GROUP`.
- Edit path: recompile source -> replace existing `SCRIPT_GROUP.commands` in place.
- On compile failure: no history mutation; show diagnostics.
- Undo/redo semantics remain unchanged (single command item for each script action).

### 4. CommandForm Script UI
In right panel (`CommandForm`), add mode split:
- `Form` mode (existing schema-driven entry)
- `Script` mode (new script editor)

Script mode UX:
- Textarea editor
- `Run Script` button
- Inline compile diagnostics (message + line/column)
- Save/update inserts or edits `SCRIPT_GROUP`

### 5. Reuse for Batch UI Entry
Node command gets `Single` and `Multiple` tabs:
- `Single`: existing behavior
- `Multiple`: table of coordinate rows

On `Multiple` submit:
- Generate script source, e.g.
  - `coords = [[...], [...], ...]`
  - `for c in coords:`
  - `  node(c)`
- Compile and insert as a single `SCRIPT_GROUP`

This gives one parametric, editable batch command instead of many independent node entries.

### 6. Python Export Alignment
Ensure export pipeline flattens `SCRIPT_GROUP.commands` and emits only valid OpenSeesPy calls; no DSL text in exported `.py`.

## Testing Plan
- Parser tests:
  - assignments
  - loops
  - list literals
  - arithmetic precedence
  - syntax errors with line/column
- Evaluator tests:
  - correct command emission
  - deterministic ID behavior
  - invalid command argument reporting
- Store tests:
  - insert script group
  - edit script group
  - undo/redo behavior
- UI tests:
  - Node `Multiple` tab creates one `SCRIPT_GROUP`
  - compile errors are surfaced and non-destructive

## Open Decisions
1. Syntax style:
   - strict Python indentation blocks
   - or explicit block terminator (`end`) to simplify parsing
2. Batch-node generated script editing:
   - directly editable immediately
   - or read-only unless user switches to Script mode

## Suggested Delivery Phases
1. Core parser/evaluator + unit tests
2. Script editor UI + store integration
3. Node multi-entry tab that compiles to script group
4. Export and regression pass
