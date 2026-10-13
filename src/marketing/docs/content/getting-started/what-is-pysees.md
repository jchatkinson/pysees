---
title: What is PySees
description: A browser-based GUI for building, running and reviewing structural models.
order: 1
keywords: overview introduction opensees openseespy carapace
---

PySees is a web app for building structural models, analysing them and reviewing the results, all in your browser. There is nothing to install and no account is needed.

![PySees Studio with a 3D frame template: the Model panel on the left, the 3D viewport in the centre and the Command panel on the right](/docs/interface-tour.png)

## How it works

You build a parametric model: nodes, materials, sections, elements, supports and loads. You then author an analysis (static, pushover, earthquake or eigen). Everything else is derived from those two things:

- The **3D viewport** draws the model and, after a run, the results.
- **Carapace**, a finite-element solver compiled to WebAssembly, runs the analysis inside your browser. See [Carapace solver](/docs/carapace/supported-features).
- An **OpenSeesPy script** can be exported so you can run the same model in OpenSees yourself.

> [!NOTE]
> OpenSees is optional. PySees never talks to a local OpenSees process. You export a script and run it yourself.

## What you can model

- 2D and 3D models. A 3D model is Z-up: the plan is the X–Y plane and levels rise in Z. A 2D model lies in the XY plane with Y up.
- Truss, elastic and fiber beam-column elements, plus 3D shell elements.
- Fiber sections from templates, AISC shapes, or fibers and patches you define.
- Static, pushover, earthquake (ground motion) and modal analyses.

## Where to go next

- [Quick start](/docs/getting-started/quick-start) takes you from a template to results in a few minutes.
- [Interface tour](/docs/getting-started/interface-tour) names every part of the screen.
- [Concepts and glossary](/docs/getting-started/concepts-glossary) explains terms such as ndm, ndf and local axes.
