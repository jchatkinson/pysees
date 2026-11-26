---
title: Navigation and selection
description: Move the camera and select nodes and elements in the viewport.
order: 1
keywords: mouse orbit pan zoom marquee window crossing select shift
---

## Camera

| Action | Control |
|---|---|
| Rotate | Middle mouse button |
| Pan | Right mouse button |
| Zoom | Mouse wheel |
| Fly | <kbd>Shift</kbd>+<kbd>F</kbd>, then <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> and right-drag. See [Fly mode](/docs/viewport/views#fly-mode) |

The left button is reserved for selection. Use **Zoom in**, **Zoom out** and **Fit** (<kbd>F</kbd>) from the View tab or the bottom bar. Fit frames the bounding box of the nodes. 3D models use a Z-up camera. In a plan or elevation the middle button pans instead of rotating.

## Selecting

- **Click a node** to select it and open it in the Command panel.
- **Shift-click** a node to add it to or remove it from the selection.
- **Click an element** to select it. Lines have a forgiving click tolerance.
- **Click empty space** to clear the selection.
- <kbd>Esc</kbd> also deselects, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>A</kbd> selects everything.
- While a [drawing tool](/docs/model/drawing-tools) is on, clicks place points instead of selecting.

With several objects selected, the right panel shows the [selection panel](/docs/model/editing#selection-panel).

### Marquee selection

Drag a rectangle in empty space to select several nodes. The drag direction sets the mode:

- **Left to right (window):** nodes must be fully inside the rectangle.
- **Right to left (crossing):** nodes that touch the rectangle count.

> [!TIP]
> Some form fields take a list of node IDs. While such a field is focused, you can click nodes in the viewport to fill it in.
