---
title: Section editor
description: Build fiber sections from templates, AISC shapes, fibers and patches.
order: 16
keywords: fiber section dialog editor preview GJ validation
---

Fiber sections are built in the section editor. Open it with **Open Section Editor…** from the Command panel, or click a fiber section in the Model panel (titled **New Fiber Section** or **Edit Section #n**).

![The section editor on the Fibers & Patches tab: tables of fibers and patches on the left and a live section preview on the right](/docs/section-editor.png)

## Layout

Two tabs on the left and a live preview on the right:

- **Template**: start from a parametric shape. See [Section templates](/docs/model/section-templates) and [AISC shapes](/docs/model/aisc-shapes).
- **Fibers & Patches**: add or edit individual fibers, rectangular patches and circular patches. See [Fibers and patches](/docs/model/fibers-patches).
- The preview draws the section. Hovering a row highlights the matching fibers.

## Rules

- Every fiber, patch and layer needs a [uniaxial material](/docs/model/materials) with usage *stress–strain*.
- In a 3D model the section needs torsional stiffness (`GJ`), unless it includes a torsion material.
- Geometry is checked before you can save.
- Editing or adding a row detaches the section from its template; the template parameters no longer drive it.

## Buttons

**Save**, **Cancel**, and **Delete** (with an inline confirmation).
