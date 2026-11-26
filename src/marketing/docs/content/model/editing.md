---
title: Selecting and editing
description: Move, copy, mirror, divide and merge objects, assign loads, supports and diaphragms to a selection, and isolate it.
order: 22
keywords: edit move copy replicate mirror divide merge isolate selection panel reassign property supports diaphragm rigid flexible assign load command palette delete
---

The **Edit** tab works on the current selection. Each operation is one undo step.

## Modify

| Command | Does |
|---|---|
| **Move** | Moves the selection by an offset |
| **Copy** | Copies the selection by an offset, 1 to 100 times (replicate). New nodes merge with existing ones; supports and masses come along |
| **Mirror** | Makes a mirrored copy across a plane |
| **Divide** | Splits the selected members into equal parts |
| **Merge** | Merges coincident nodes in the selection, or in the whole model when nothing is selected |

## Assign loads

**Nodal** adds a load to each selected node (global directions) and **Member** a uniform load to the selected members (local axes: wy and wz across, wx along), in a load pattern you choose.

## Selection panel

When several objects are selected, the right panel shows a summary instead of a single form:

![The selection panel with the whole rowhouse selected: elements grouped by property, frame property, supports, diaphragm and delete](/docs/selection-panel.png)

- **By property:** the selected elements grouped by property. Reassign a group to another property, select every element with that property, or keep only that group selected.
- **Supports:** give the selected nodes a fixed, pinned or roller support, or clear them.
- **Diaphragms:** assign a diaphragm to each level of the selected nodes, either **Rigid (constraint)**, a `rigidDiaphragm` constraint per level, or **Flexible (Carapace-only)**, a diaphragm element with a sheathing shear stiffness Ga and chord and interior axial stiffnesses (EA). Nodes that are supported in-plane, or alone on their level, are left out.
- **Delete selection.**

## Select, isolate and delete

- **Select all** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>A</kbd>), **Clear** (<kbd>Esc</kbd>) and **Delete** (<kbd>Delete</kbd>).
- **Isolate** shows only the selected objects (and frames them); **Show all** brings everything back.

## Command palette

**Commands** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>) searches every ribbon command by name and runs it.
