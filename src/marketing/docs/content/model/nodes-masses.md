---
title: Nodes and masses
description: Create nodes, assign nodal mass and pick nodes in the viewport.
order: 1
keywords: node coordinates mass lumped dof
---

## Nodes

A node has an ID and coordinates: two in a 2D model, three in a 3D model. IDs are managed by the app. Add a node by choosing the node command in the Command panel (search for it in the add box), or edit an existing one by clicking it in the viewport or in the **Nodes** group of the Model panel.

Deleting a node asks you to confirm and lists everything that depends on it (elements, supports, loads).

## Masses

The **Masses** group holds nodal masses, one entry per node, with a value for each degree of freedom. Mass is needed for [eigen](/docs/analysis/eigen) and [earthquake](/docs/analysis/earthquake) analyses. An eigen analysis that asks for more modes than there are massive free DOFs fails with a diagnostic.

> [!TIP]
> Beam elements can also carry mass through their `-mass` argument (mass per unit length).
