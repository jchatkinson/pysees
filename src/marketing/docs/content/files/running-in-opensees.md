---
title: Running in OpenSees
description: What to know when you run an exported script yourself.
order: 3
keywords: opensees export script pressure self-weight localForce
---

PySees scripts are valid OpenSeesPy and are checked against real OpenSees. A few things are written differently from what you see in the app:

- **Patterns** are declared immediately before the stage that uses them. Earthquake patterns are removed after their stage.
- **Beam forces** are recorded as `localForce`, matching the local N, V and M shown in PySees. Trusses and zero-length elements use global `force`.
- **Shell pressure** is expanded into per-node `load` commands. Shell self-weight is exported with OpenSees' sign, and a ShellDKGT's is expanded the same way.
- **Beam mass** is lumped.
- **Modal damping** is written as a calculation between `# PySees: modal damping begin` and `end` comments.

Carapace and OpenSees are tested against each other: displacements, reactions and element forces agree step by step to a tight tolerance.
