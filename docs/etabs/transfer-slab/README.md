# Transfer slab: PySees vs ETABS

An internal comparison of PySees and ETABS on a transfer slab. It isn't on the website, so check the ETABS licence terms before publishing any of it.

## Summary

A 20 × 20 ft slab sits on four columns and carries a 1000 kip transfer column placed off-centre.

**Benchmark:** a 12 in slab with each column head made rigid over its 24 × 24 in footprint (ETABS Model F). There, PySees and ETABS agree:
- within **1.2 %** on vertical reactions;
- within **1–5 %** on column base moments and shears;
- within **2.3 %** on the deflection at the top of the transfer column.

**Why the rest differs:**
- **Different plate elements.** Carapace's `ShellMITC4` treats the slab rotation as its own field, independent of the slope (Reissner–Mindlin). ETABS' Shell-Thick behaves at the column joints like a discrete Kirchhoff element, whose rotations are tied to the slope.
- **Carapace's shell is not the outlier.** It matches OpenSees' `ShellMITC4` and the separately written `ASDShellQ4` to 0.1 %. ETABS' column moments match OpenSees' thin-plate `ShellDKGQ` within about 2 %.
- **The gap grows with slab thickness.** It is about 5 % for the 12 in slab and about 7 % for 36 in (span/thickness ≈ 5).
- **A single-node column connection isn't a fair comparison.** Each element treats a moment concentrated on one node differently. Base moments then differ by 3–12 % for the 36 in slab and 10–25 % for 12 in, so connect columns over their footprint.

## Model (kip, in)

| | |
|---|---|
| Slab | 20 × 20 ft (240 × 240 in), at z = 10 ft. 36 in thick (Models A–D) or 12 in thick (E, F). `ShellMITC4` (ETABS: Shell-Thick), 12 in mesh, no self-weight |
| Supporting columns | 24 × 24 in, 10 ft, base fixed at z = 0, at (2, 2), (18, 2), (18, 18), (2, 18) ft |
| Transfer column | 24 × 24 in, 10 ft, from the slab up to z = 20 ft, at **(6, 8) ft**, top free |
| Load | 1000 kip down at the top of the transfer column |
| Material | E = 4000 ksi, ν = 0.2 (G = 1666.7 ksi), linear elastic |
| Column properties | A = 576 in², I = 27 648 in⁴ (both axes), J = 0.1406 b⁴ = 46 648 in⁴ (ETABS: 46 742 in⁴), no shear deformation |
| Footprint variants | Each column head tied rigidly to the 3 × 3 slab nodes in its footprint. PySees uses `rigidLink beam`s; ETABS uses rigid links (B) or the footprint's 4 shells with all stiffness modifiers × 100 (D, F). In PySees the two methods agree within 0.6 %, in ETABS within 1 % |

**ETABS settings that matter:**
- **No diaphragm.**
- **Column shear area modifiers V2 = V3 = 0.** ETABS columns are Timoshenko by default, which would add about 11 % lateral flexibility.
- **No end offsets or rigid zones.**
- **No auto mesh.** Draw the slab as 12 in areas; ETABS' default mesh split one corner area.
- **Linear static load case**, self-weight multiplier 0.

**ETABS models**, all in one file (`TransferSlab.edb`), offset along X:

| Model | Slab | Column connection | Mesh | X offset (in) |
|---|---|---|---|--:|
| A | 36 in | single node | 12 in | 0 |
| B | 36 in | footprint, rigid links | 12 in | 480 |
| C | 36 in | single node | 6 in | 960 |
| D | 36 in | footprint, stiff shells | 12 in | 1440 |
| E | 12 in | single node | 12 in | 1920 |
| F | 12 in | footprint, stiff shells | 12 in | 2400 |

## Results

Forces are in kip and moments in kip·ft, about each column base. In the element tables each cell is Fz, Mx, My. Full PySees tables, with joint displacements, are in [reactions.md](reactions.md).

### 12 in slab, rigid footprint: the benchmark

| Slab element | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| PySees ShellMITC4 | 497.5, −481.8, 308.3 | 138.3, −108.8, −338.2 | 99.4, 247.6, −282.5 | 264.8, 515.9, 115.1 |
| OpenSees ASDShellQ4 | 497.5, −481.7, 308.3 | 138.3, −108.8, −338.1 | 99.4, 247.6, −282.5 | 264.8, 515.8, 115.0 |
| OpenSees ShellDKGQ (thin) | 499.0, −487.3, 312.5 | 137.0, −111.4, −343.4 | 100.2, 253.9, −290.6 | 263.8, 521.0, 117.6 |
| **ETABS Shell-Thick (F)** | 498.6, −488.1, 315.1 | 137.2, −114.0, −342.0 | 100.6, 253.4, −290.2 | 263.6, 521.3, 121.1 |

ETABS F divided by PySees:

| Column | Fx | Fy | Fz | Mx | My |
|---|--:|--:|--:|--:|--:|
| C1 | 1.018 | 1.012 | 1.002 | 1.013 | 1.022 |
| C2 | 1.015 | 1.033 | 0.992 | 1.048 | 1.011 |
| C3 | 1.034 | 1.029 | 1.012 | 1.023 | 1.027 |
| C4 | 1.036 | 1.011 | 0.996 | 1.011 | 1.052 |

- **Deflection at the top of the transfer column:** ETABS −0.647 in, PySees −0.662 in, ShellDKGQ −0.633 in.
- **Mesh:** refining PySees to a 6 in mesh changes it by less than 0.6 %.

### 36 in slab, rigid footprint

| Slab element | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| PySees ShellMITC4 | 466.1, −88.9, 62.0 | 158.7, −39.6, −52.8 | 92.2, 39.2, −36.2 | 283.0, 86.4, 41.5 |
| OpenSees ASDShellQ4 | 466.1, −88.9, 62.0 | 158.7, −39.6, −52.8 | 92.2, 39.2, −36.1 | 283.0, 86.4, 41.4 |
| OpenSees ShellDKGQ (thin) | 467.5, −83.8, 59.3 | 157.3, −42.0, −50.9 | 93.5, 41.5, −37.2 | 281.6, 81.6, 42.2 |
| **ETABS Shell-Thick (D)** | 467.8, −83.2, 59.3 | 157.0, −42.1, −49.7 | 94.0, 41.1, −36.4 | 281.2, 80.6, 42.7 |

ETABS D against PySees: Fz within 2.1 %, moments −7 % to +6 %. ETABS B (rigid links) agrees with D within 1 %.

### Single-node connection (A, C, E)

| | Fz | Base moments and shears | Slab deflection under the load |
|---|---|---|---|
| 36 in (A) | within 0.3 % | ETABS 3–12 % higher | −0.0902 in vs −0.0903 in |
| 12 in (E) | within 1.6 % | ETABS 10–25 % higher | |

Refining the mesh to 6 in lowers the 36 in single-node moments by about 3 % in PySees and about 1 % in ETABS (C). Both move the same way, but they don't meet.

## Why the elements differ

**What CSI's shell is.** CSI's shell descends from Ibrahimbegovic & Wilson, *A unified formulation for triangular and quadrilateral flat shell finite elements with six nodal degrees of freedom* (Communications in Applied Numerical Methods, 1991):
- **Plate bending:** a discrete Kirchhoff quadrilateral (DKQ). This is a thin plate whose nodal rotations are tied to the slab's slope along the element edges.
- **Membrane:** an element with a true drilling rotation, the slab's in-plane rotation about its own normal.

That is essentially CSI's Shell-Thin, and a close relative of OpenSees' `ShellDKGQ`, which is a DKQ plate plus a GQ12 drilling membrane.

**What ETABS' Shell-Thick seems to be.** CSI describes it as Mindlin/Reissner, with transverse shear included. The paper doesn't cover it. Our results suggest a discrete Kirchhoff–Mindlin extension (DKMQ type, Katili 1993), which adds shear strain to the DKQ while keeping its edge constraints between rotation and slope:
- Its deflection includes shear flexibility. Under the single-node load on the 36 in slab, ETABS' deflection matched the Mindlin answer to 0.1 %.
- Its rotations at the column joints stay close to Kirchhoff slopes. ETABS' footprint moments match ShellDKGQ within about 2 % at both thicknesses.

This is an inference from the numbers. CSI's documentation hasn't confirmed it.

**Why that changes column moments.** A column joined to a slab node takes on that node's rotation θ:
- **MITC4 and ASDShellQ4:** θ is its own field, and the shear strain (slope − θ) is interpolated from the element edges. Near a heavily loaded column the shear strain is large, so θ differs from the slope by several percent.
- **DK-family elements:** θ stays close to the slope at the nodes.

The gap therefore scales with the shear strain at the columns, which is why it is larger for the 36 in slab.

**Ruled out:**

| Possible cause | Test | Effect |
|---|---|---|
| Slab transverse shear stiffness | Scaled ×0.8–1.2 in PySees | Moment ratios change less than 1 % |
| Slab membrane stiffness | Raised ×100 in PySees | Moments change less than 1.5 % |
| Twist stiffness or Poisson's ratio | Varied in PySees | Shifts the pattern, but no single value matches all columns |
| Column shear deformation | ETABS columns set to Euler–Bernoulli (V2 = V3 = 0) | Removed from the comparison |
| How the footprint is made rigid | ETABS B's links checked | Move as an exact rigid body; stiff shells (D) give the same within 1 % |
| A Carapace bug | Same model in OpenSees ShellMITC4 and ASDShellQ4 | Agree to 0.1 % |

**Open:**
- **Is ETABS Shell-Thick DK-like at the joints?** Rerun D and F as Shell-Thin. If the column moments barely change and stay near ShellDKGQ, that confirms it.
- **Which answer is right for the 36 in slab?** Neither plate theory is exact at span/thickness ≈ 5. Only a 3D solid model (bricks through the thickness) can say.

## Files

- **PySees projects:** `transfer-slab[-12in][-footprint].pysees.py`. Open them with **File > Open .py…**.
- **OpenSeesPy scripts:** `transfer-slab[-12in][-footprint].py`, the same models as plain scripts.
- **[reactions.md](reactions.md):** PySees reactions and column-head joint displacements, for every variant at 12 in and 6 in meshes.
- **Builder:** `src/app/lib/verification/etabs/transferSlab.ts`, function `transferSlab(mesh, { footprint, h })`.
- **Test:** `transferSlab.test.ts`, alongside the builder. It checks Carapace against OpenSees and that the vertical reactions sum to the load.
- **Regenerate the files:**

  ```bash
  WRITE=1 npx vitest run src/app/lib/verification/etabs
  ```
- **ETABS side:** `TransferSlab.edb` and the agent's scripts (`build_and_run.py`, `add_models_bc.py`, `add_model_d.py`, `add_models_ef.py`) are on the ETABS machine. They aren't in this repo.
