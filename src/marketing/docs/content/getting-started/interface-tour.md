---
title: Interface tour
description: The menus, panels and viewport of PySees Studio.
order: 3
keywords: layout top bar action bar panels menus shortcuts
---

Studio has a ribbon along the top, three resizable panels and a bottom bar.

![The PySees Studio window with a 3D frame template: Model panel on the left, 3D viewport in the centre, Command panel on the right and the bottom bar](/docs/interface-tour.png)

## Ribbon

The ribbon is the app's menu and toolbar. Its tabs group the commands; hover a button for a description and its shortcut. The chevron at the right collapses it to one row of icons.

| Tab | Groups |
|---|---|
| **File** | New, Open, Save, Import (.tcl / .py), Export .tcl |
| **Model** | Undo / Redo, [Draw](/docs/model/drawing-tools) tools, [View](/docs/viewport/views) (3D, Plan, Elevation, Extrude, story picker), Select, Define (Grids & levels, [Underlays](/docs/viewport/underlays), Units) |
| **Edit** | Undo / Redo, Select (with Isolate), [Modify](/docs/model/editing) (Move, Copy, Mirror, Divide, Merge), Assign loads, View |
| **View** | View (with Ortho and Fly), Stories, Zoom, Show, Isolate, Loads, Labels, Reference. See [View tab and display](/docs/viewport/view-menu) |
| **Results** | Result type, step playback, Reactions, Values, Display panel and Plot, View |

**Commands** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>) searches every ribbon command by name. When a run finishes, the ribbon switches to the Results tab.

## Left panel

Three tabs:

- **Model** lists every entity in groups with counts: nodes, masses, materials, sections, elements, transforms, beam integrations, constraints, time series, load patterns and more. Click a row to edit it.
- **Analysis** is the ordered list of analysis commands, with the Run button and status.
- **Report** holds the plots you saved.

## Centre: viewport

The 3D scene. Results controls float over it. See [Navigation and selection](/docs/viewport/navigation-selection).

## Right panel

- **Command** shows the form for whatever is selected, or a search box to add a new command. With several objects selected it shows the [selection panel](/docs/model/editing#selection-panel); while a drawing tool is on, the tool's options.
- **Results** shows recorded results as tables.

## Bottom bar

The status line, zoom in, zoom out, fit to view and a perspective / orthographic toggle, and a coordinates readout.

## Keyboard

See [Menus and shortcuts](/docs/reference/menus-shortcuts). Shortcuts are ignored while you type in a field.
