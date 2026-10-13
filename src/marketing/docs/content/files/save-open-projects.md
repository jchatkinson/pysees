---
title: Save and open projects
description: How PySees projects are stored as annotated OpenSeesPy scripts.
order: 1
keywords: save open load project py script annotations export tcl import
---

A saved project is an **OpenSeesPy script** with `# @pysees` comment lines carrying what a script cannot express. You can run the file in OpenSees, and reopen it in PySees to get the full project back.

## Save and open

- **File > Save .py** downloads the project (default name `model.py`). It is disabled until a model exists.
- **File > Open .py** (or **Load** in the New model dialog) reads a project. A preview shows counts and any problems before you confirm.

### What is saved

The model, the analysis commands up to the current undo position (disabled commands included), grids and levels, saved plots, and display preferences including units.

### What is not saved

Computed results, undo history, selection and playback state. Run the analysis again after opening.

> [!WARNING]
> Opening is strict. A malformed `# @pysees` block stops the open and reports line-specific errors. Generated blocks are authoritative on open: edits made by hand inside them are ignored.

## Import a plain script

**File > Import .tcl / .py** reads an OpenSees script without running it. Constants and arithmetic are substituted; loops, conditionals and procedures are reported and skipped. Only the model is imported, not analysis commands. A dialog lists entity counts and diagnostics (error, warning, info) with line numbers, then **Replace model** loads the result.

## Export

**File > Export .tcl** downloads a Tcl script of the model and analysis. Tcl exports carry no annotations, so they cannot be reopened as a full project.
