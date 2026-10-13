---
title: Materials
description: Uniaxial and nD materials, and what "Used as" means.
order: 3
keywords: uniaxial steel concrete elastic usage stress-strain force-deformation
---

Materials live in the **Materials** group. PySees offers the OpenSees uniaxial materials (about 75 types, such as Elastic, ElasticPP, Steel01, Steel02, Concrete01) and nD materials.

## Materials in Carapace

Carapace, the in-browser solver, has its own implementations of the materials below. Whether you can run one from PySees depends on the last column.

| Material | Behaviour | Typical use | Runs in PySees |
|---|---|---|---|
| **Elastic** | Linear elastic, equal in tension and compression. Parameter: `E`. | Elastic members, springs | Yes |
| **ElasticPP** | Elastic–perfectly plastic with permanent set. Parameters: `E`, `epsyP`. | Simple yielding springs and steel | Yes |
| **ENT** | Elastic, no tension. Parameter: `E`. | Compression-only struts and soil | Yes |
| **Steel01** | Bilinear steel with kinematic hardening `b` and optional isotropic hardening (`a1`–`a4`). | Reinforcing and structural steel fibers | Yes |
| **Steel02** | Menegotto–Pinto steel with a smooth elastic-to-plastic transition (`R0`, `cR1`, `cR2`), hardening `b` and optional isotropic hardening. | Steel fibers where the Bauschinger effect matters | Yes |
| **Concrete01** | Kent–Scott–Park compression envelope with degrading unloading and no tension. Parameters: `fpc`, `epsc0`, `fpcu`, `epsU`. | Concrete fibers (compression only) | Yes |
| **Concrete02** | Concrete01 plus linear tension softening. Adds tensile strength `ft` and softening slope `ets`. | Concrete fibers where cracking and tension stiffening matter | Not yet |
| **Hysteretic** | Tri-linear backbone, different in each direction, with pinching and stiffness and strength degradation. Parameters: three (force, deformation) points per side, `pinchX`, `pinchY`, two damage factors and `beta`. | Moment–rotation and force–deformation springs | Not yet |
| **Pinching4** | Four-point backbone per side with pinching and independent unloading-stiffness, reloading-stiffness and strength damage rules (energy- or cycle-based). | Detailed degrading springs, such as timber and masonry connections | Not yet |
| **Gap** | One-sided gap: stiff after the gap closes. Parameters: `E`, `gap`. | Contact and pounding springs | Not yet |
| **Parallel**, **Series**, **MinMax** | Combine other materials: share strain, share stress, or fail outside a strain range. | Composite behaviour, fracture limits | Not yet |

> [!NOTE]
> "Not yet" means the solver implements the material but the PySees compiler does not pass it on, so a run stops with *Material N (type) is not yet supported by the Carapace compiler*. The material can still be created and exported to OpenSees, but the material preview does not support it either. Everything else in the OpenSees list, including nD materials, also stops a Carapace run.

Some optional arguments are not passed to Carapace: `epsyN` and `eps0` on ElasticPP (the yield strain is the same in both directions), and an initial stress on Steel02.

## Creating a material

Choose the material type in the add box, or use **New Material…** from any material picker (for example inside the section editor). The **New Material** dialog shows the type's parameters, a live code preview, and these buttons: **Preview**, **Reset**, **Cancel** and **Create**. Parameter names follow the Carapace schema in lower case (`fy`, `e0`, `epsU`).

## Used as

Every uniaxial material has a **Used as** setting, fixed when it is created and locked when you edit it:

- **Stress–strain** for fibers, patches, layers and trusses.
- **Force–deformation** for zero-length springs.

The setting decides whether parameters are shown as stresses and strains or as forces and deformations, and which pickers offer the material.

## Previewing

**Preview** opens the [material preview](/docs/model/material-preview) to check the behaviour before you use it.
