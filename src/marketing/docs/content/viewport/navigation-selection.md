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

The left button is reserved for selection. Use **Zoom In**, **Zoom Out** and **Zoom To Fit** from the View menu or the bottom bar. Fit frames the bounding box of the nodes. 3D models use a Z-up camera.

## Selecting

- **Click a node** to select it and open it in the Command panel.
- **Shift-click** a node to add it to or remove it from the selection.
- **Click an element** to select it. Lines have a forgiving click tolerance.
- **Click empty space** to clear the selection.
- <kbd>Esc</kbd> also deselects.

### Marquee selection

Drag a rectangle in empty space to select several nodes. The drag direction sets the mode:

- **Left to right (window):** nodes must be fully inside the rectangle.
- **Right to left (crossing):** nodes that touch the rectangle count.

> [!TIP]
> Some form fields take a list of node IDs. While such a field is focused, you can click nodes in the viewport to fill it in.
