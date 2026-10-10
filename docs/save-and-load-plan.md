# Save and open annotated OpenSeesPy projects

## Summary

The **saved project is the OpenSeesPy script**. Replace **Export .py** with **Save .py…**; maintain one Python serialization path. Keep **Export .tcl** as a separate action.

Saved Python builds the model and runs the active, enabled analysis sequence. Structured comments let PySees restore the complete authored project.

## Persistent content and annotations

Save every model entity, IDs and allocation counters, pattern names, section templates, child ordering, active analysis definitions—including disabled commands—grids, levels, saved plots, plot configuration and display preferences.

Exclude computed results, undo/redo history, selections, playback position and temporary panel state. Save analysis commands through the cursor; restore the cursor to the last saved command.

Use readable JSON comments with a reserved `# @pysees` prefix and a versioned header:

- **Project metadata** preserves grids, levels, report/display configuration and counters.
- **Entity metadata** preserves names, templates, app-only IDs and details ordinary command decoding cannot recover.
- **Bounded generated blocks** describe an authored definition before the equivalent executable commands.

Generated-block comments are authoritative when opening. Restore the annotated original and skip the enclosed Python, including manually edited generated commands. Ordinary commands outside those blocks remain authoritative.

Use generated blocks for shell pressure, ShellDKGT self-weight, earthquake mass conversion and expanded analysis definitions. Preserve source child positions and avoid double counting. Do not embed a duplicate snapshot of the entire model.

## Implementation and interfaces

Introduce a typed `ProjectDocument`, `serializeProject` and `parseProject` around the existing schemas and shared command pipeline.

- Extend command emission with entity provenance and annotation boundaries; print annotations structurally.
- Make this the sole Python save/export implementation, replacing the current plain Python download path.
- Preserve existing analysis staging, deferred patterns, earthquake transformations and runtime damping calculations. Execute only active, enabled analysis commands, honoring disabled commands recursively.
- Restore authored model definitions independently of where their executable equivalents appear during analysis.
- Audit every entity kind, including `misc`, and close encoding/decoding gaps. Annotations cannot substitute for missing executable model definitions.
- Parse files statically in the browser. Never execute Python while opening.
- Validate before replacement. Malformed metadata, unsupported versions, unmatched boundaries or undecodable required commands block opening with line-specific diagnostics.
- Restore the project atomically through a store action, preserving counters, clearing results and resetting transient state.

Executing the saved script reproduces the structural definitions and equivalent physical loads, then performs analysis. Opening restores the authored project before analysis.

## File menu and compatibility

Use these File actions:

- **New Model**
- **Open .py…**
- **Save .py…**
- **Import .tcl / .py…**
- **Export .tcl**

Save downloads `model.py` initially and retains an opened filename for subsequent downloads.

Open previews the project before replacing current state. Annotated files selected through Import receive full project restoration. Unannotated Python files use the existing model-only importer; the preview identifies that limited scope.

Document annotation precedence and generated blocks. Preserve external file references as authored; bundling referenced data is outside this feature.

## Acceptance tests

- Compare complete persistent state after save → open, including counters, templates, disabled analyses and report/display configuration; ignore only map insertion order.
- Cover existing fixtures plus shell pressure, mixed self-weight, earthquake mass conversion, staged analyses, runtime damping, script groups and deleted-ID gaps.
- Verify generated loads and masses restore exactly once. Test edits inside generated blocks and ordinary model edits outside them.
- Test escaped/multiline names, Unicode, CRLF, invalid annotations and atomic failure behavior.
- Require deterministic save → open → save output.
- Execute saved scripts in real OpenSeesPy and compare their model and analysis behavior with existing validated exports.
- Run relevant tests, type checking and linting without building PySees or starting its dev server.
