# Ground-motion transient analysis

PySees runs fixed-step Newmark average acceleration (gamma 0.5, beta 0.25) in Carapace,
inside the browser worker. Both 2D and Z-up 3D models support simultaneous uniform
excitation in global translational directions. Displacement, velocity and acceleration
are **relative to the moving ground**; acceleration plots are not absolute floor accelerations.

## Input workflow

1. Assign nodal masses, beam mass per unit length, or supported element density. A model
   without mass cannot respond to ground acceleration.
2. Add a **Time Series**, choose **Path**, and select a record file. The ground-motion
   importer appears in the same form when editing a Path series.
3. Choose the data layout and unit conversion, inspect the scaled acceleration preview,
   and click **Use this record**, then save the time series.
4. Add a **UniformExcitation** pattern: direction 1 = X, 2 = Y, 3 = Z (3D only),
   and acceleration series tag = the imported time series. Its factor multiplies the
   Path factor; normally leave the pattern factor at 1.
5. Add **Whole Model Recorder** and enable velocity/relative acceleration if needed.
   Add **Run Earthquake Analysis** with analysis dt, number of steps, solver/convergence
   settings and Rayleigh coefficients (alphaM for mass, betaK for current stiffness).
   Leave pattern tags empty for all UniformExcitation patterns, or select a subset.
6. Run and inspect the time histories in Results and Plots. The analysis time step can
   differ from the record sample interval; acceleration is linearly interpolated.

A preceding static stage can establish gravity and freeze it using Hold Loads Afterward.
Earthquake time starts at zero while retaining the current structural state and frozen loads.

## Record formats and validation

- PEER NGA/NGA-West2 `.AT2`: modern `NPTS=..., DT=...` and legacy `1999 0.0100 NPTS, DT`
  headers; whitespace-packed numbers and E/D scientific notation. The declared sample
  count must match the actual data. Velocity/displacement PEER files are rejected.
- CSV, semicolon-separated, tab-separated or whitespace tables with numeric time and
  acceleration columns. Two columns are detected automatically. Select table layout
  and 1-based column numbers for wider tables. Times must increase strictly; variable
  intervals are supported.
- One acceleration value per line or packed acceleration values, with text headers,
  comments and optional `DT = ...` metadata. Supply dt if absent. Numeric header rows
  can be skipped explicitly. Packed rows with two columns need the values layout.
- Malformed data after the numeric body starts, missing values, duplicate times,
  nonfinite numbers and inconsistent widths fail with a diagnostic. No samples are
  silently discarded. Limits: 32 MB of text and one million samples.

Preview buckets retain minima and maxima so narrow peaks remain visible. Unit conversion
and a linear amplitude multiplier combine into the Path factor without changing raw samples.
Zero and negative factors are valid. PEER acceleration in g requires an explicit conversion
matching the model's length units (e.g. 9.80665 for metres and seconds). CSV/text require the
user to know the record units. Samples are embedded; no external file is needed at run/export.

Uniformly sampled records offer **Prepend zero** (enabled by default), adding one sample
interval before the original data to start from rest. For `public/LOS000.AT2`, the original
1,999 samples have dt 0.01 s and span 0–19.98 s; prepending zero spans 0–19.99 s.
The preview includes that added interval. Path returns zero outside the record unless
`useLast` is enabled. Explicit-time paths cannot also prepend zero automatically.

## Export and engine notes

Both OpenSeesPy and Tcl export embedded Path values. Ground-motion patterns are declared
at their earthquake stage and removed afterward, so gravity stages do not excite the ground
and a later earthquake can choose different patterns. Beam lumped masses are expanded into
equivalent nodal masses for transient export and compilation. This avoids the double subtraction
of an inertia load in OpenSees 3.8's ElasticBeam2d `getResistingForceIncInertia`; see
[OpenSees source](https://github.com/OpenSees/OpenSees/blob/master/SRC/element/elasticBeamColumn/ElasticBeam2d.cpp).
Ordinary model-only export preserves the beam `-mass` option. The authored model is unchanged.

Carapace now accepts massless rotation DOFs through the Newmark effective stiffness and
computes support reactions including the support's equivalent ground inertial load. Its
legacy `path` wire series still holds its endpoints; the new `boundedPath` supplies the
OpenSees accelerogram bounds. Invalid path arrays are rejected before interpolation.

Current limits: fixed analysis steps (no automatic cutback), average-acceleration Newmark
only, acceleration-only uniform excitation, no imposed displacement/velocity support motion,
no nonzero initial ground velocity, no automatic baseline correction/filtering/resampling,
no response-spectrum or absolute-acceleration plot preset. General multi-point-constraint
limitations remain those of the Carapace compiler. Unsupported settings must produce diagnostics.

Validation covers the supplied PEER record, parser failures, embedded Python/Tcl export,
2D/3D damped transient responses with massless rotations, and displacement/velocity/relative
acceleration/reaction/member-force comparisons against real OpenSees. Native tests additionally
compare a massless-rotation beam with a condensed SDOF and check accelerogram bounds.

## Rayleigh damping

The earthquake block offers **Modal periods**, **Anchor periods**, and **Coefficients**.
For modal periods, enter names such as `T1` and `T3` plus a damping percentage.
Carapace solves the requested modes from the current model state at the start of
the earthquake (after preceding gravity), then calculates the coefficients. A separate
modal block is not required. An unavailable mode fails the run rather than substituting
another mode. Python and Tcl exports perform the same eigensolve and coefficient
calculation at that point in the sequence. For anchor periods,
enter two positive periods in seconds (for example T1 and T3 from modal results) and
the damping percentage to match at both anchors. The block shows ω = 2π/T in rad/s
and calculates αM = 2ζω1ω2/(ω1+ω2), βK = 2ζ/(ω1+ω2), with ζ = percentage/100.
The same coefficients drive Carapace and OpenSees export. Equal periods are accepted
and give equal mass and stiffness contributions at that frequency.

Direct coefficient entry remains available; existing blocks retain their coefficients.
All options use current stiffness, C = αM M + βK Kcurrent, matching the
[OpenSees Rayleigh command](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/damping/rayleigh.html).
Numeric anchor periods are entered values; they do not automatically track later model changes.
