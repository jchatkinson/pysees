# Script import: documentation example audit

Research date: 2026-10-10. This is a source inspection, not a claim that any example imports or runs successfully in PySees. No downloaded example was executed, and PySees was not built or served.

## Scope and method

Inspected the examples reached from the [OpenSeesPy examples index](https://openseespydoc.readthedocs.io/en/latest/src/examples.html), the [OpenSees Basic Examples Manual](https://opensees.berkeley.edu/wiki/index.php/Basic_Examples_Manual), [Advanced Examples Manual](https://opensees.berkeley.edu/wiki/index.php/Examples_Manual), [practical examples index](https://opensees.berkeley.edu/wiki/index.php/Examples), and [legacy script collection](https://opensees.berkeley.edu/OpenSees/user/examples.php). Also inspected the two examples in the [new OpenSees examples site](https://opensees.github.io/OpenSeesExamples/), the five linked Tcl sensitivity example archives, and the six examples reached through the OpenSeesPy opsvis link.

The OpenSeesPy main collection has **29 primary scripts**, after expanding Moving Mesh and Background Mesh into their five actual examples, plus two plotting-library links. Read the primary scripts and linked Python helpers from the documentation repository at commit `ce0d8f1ded3c722119c44d5b3a2073c9dce47828`. Python control structures were located with the standard-library AST parser; model-command placement and dependencies were then inspected. Tcl commands and control structures were located in downloaded scripts and archives, with model-generation and analysis sections inspected separately. The companion [per-script inventory](script-import-example-inventory.md) records sources and line locations. Tcl inventory locations are lexical evidence, not execution counts or a complete Tcl grammar analysis.

The legacy site's relative downloads incorrectly resolve under `/OpenSees/user/examples/`. **32 scripts were recovered under `/OpenSees/examples/`**. Examples 4.1–8.1 were inspected in the official OpenSees repository where the old downloads remained unavailable. `solid01.tcl` could not be retrieved from either location; its contents are not classified. The legacy Reliability link also returns 404; that linked collection could not be inspected. The basic manual's Steel Frame link is a missing wiki page, so the separately available legacy steel scripts are reported instead. The RC earthquake basic example has a broken download but its analysis code is present on the page. The Mega-Tall example's available `Model1.rar` was inspected; a second model archive was not linked from the page we retrieved. External plotting libraries' internal implementations, the entire OpenSees repository, and examples mentioned only in prose are outside this audit.

## What the corpus establishes

**Control flow is necessary for useful model import, but supporting loops alone is insufficient.** Among the 29 primary Python scripts, **16 put at least one model creation or modification command inside a loop, conditional, or user function**. This includes loads, supports, masses, and staged boundary-condition changes, as well as geometry. Two of the 29 are parallel “hello world” scripts with no model. These are source-placement counts, not import-success percentages or estimates of how users write scripts. They exclude hidden execution in imported dependencies, numerical-array operations, and OpenSees mesh generators.

The common mechanisms are:

| Mechanism | What it generates | Evidence |
|---|---|---|
| Direct commands with variables and arithmetic | Nodes, members, materials, fiber patches/layers, loads | Python trusses, RC gravity, thermal beam; Tcl introductory cantilevers and basic elastic frame |
| Nested numeric loops | Regular frames, pile nodes/springs, soil meshes, mass and load distributions | Python PortalFrame2d and pile; Tcl advanced examples 6 and 8 |
| Lists, dictionaries, Tcl arrays, and indexing | Member properties by floor, section lookup, layer geometry, groups of tags | Python PortalFrame2d's section dictionary; Tcl soil-column arrays and generic-frame load lists |
| Helper functions/procedures | Sections, rotational springs, member wrappers, whole test models | Python MomentCurvature; Tcl Wsection, RCsection, genPlaneFrame, panel-zone helpers |
| Conditional model selection | Elastic versus nonlinear sections/elements, optional constraints | Tcl RCFrame4/5, advanced 3D frames; Python background-mesh obstacle |
| Includes/imported files | Units, materials, section helpers, entire model definitions, motion data | Python RC pushover/earthquake; most larger Tcl examples |
| OpenSees-generated meshes and model queries | Interior nodes/elements, boundary groups, node masses | Python tsunami examples and cantilever sensitivity; Tcl block2D/block3D examples |
| Repeated model construction | Several parameter cases rather than one final model | Python RotD and SDOF comparison; Tcl sensitivity FFD variants, SCBF, diaphragm comparison |
| Solver-dependent model changes | Response-based prescribed displacements, removal/staging, parameter updates | Python PM4Sand; Tcl excavation and Matlab parameter-search example |

**Many loops are analysis-only.** Truss stepping, pushover convergence recovery, transient stepping, recorder loops, and plot loops often leave the original geometry unchanged. Skipping those is appropriate for model import if subsequent model-building commands can still be resolved. However, loads and constraints are often authored after gravity analysis or inside files named `analyze.*`; neither “stop at the first analyze” nor “ignore every analysis file” is a reliable boundary.

## OpenSeesPy: every primary example

Links refer to the documentation page; exact script and helper locations are in the inventory. “Direct” describes entity definitions, not full compatibility with the current parser or Carapace.

| Example | How model items are defined | Control flow and import implications |
|---|---|---|
| [Elastic truss](https://openseespydoc.readthedocs.io/en/latest/src/truss.html) | Four explicit nodes, three explicit trusses, material, supports, point load | Final `if/else` validates response; no model-generation loop. Uses `from … import *`. |
| [Nonlinear truss](https://openseespydoc.readthedocs.io/en/latest/src/nonlinearTruss.html) | Explicit nodes, materials, and trusses | `for range(Nsteps)` advances analysis and collects response; geometry does not need it. |
| [PortalFrame2d](https://openseespydoc.readthedocs.io/en/latest/src/PortalFrame2d.html) | Floor/bay loops generate nodes, masses, equalDOF constraints, columns, and beams; wrapper function resolves section properties from a dictionary | Nested `for`, `if/else`, `+=`, nested list indexing, string-key dictionary lookup, function calls, imported math. Later loops compare results. A range-only implementation would still miss its elements and properties. |
| [Moment curvature](https://openseespydoc.readthedocs.io/en/latest/src/MomentCurvature.html) | Fiber section is direct; `MomentCurvature(...)` creates nodes, constraints, zeroLengthSection element, and load patterns | Function with default argument interleaves model creation and analysis. No loop is needed to create the missing test rig. Later `if/else` is validation. |
| [RC gravity frame](https://openseespydoc.readthedocs.io/en/latest/src/RCFrameGravity.html) | Explicit nodes, material definitions, fiber patches/layers, members, and gravity loads | Response-validation `if/else` only; direct model generation. |
| [RC pushover](https://openseespydoc.readthedocs.io/en/latest/src/RCFramePushOver.html) | Imports `RCFrameGravity`, whose top-level code builds the frame; adds lateral loading locally | Model depends on a local module, rather than a local loop. `while` and `if` handle convergence and target displacement. |
| [Three-story steel frame](https://openseespydoc.readthedocs.io/en/latest/src/ThreeStorySteel.html) | Explicit nodes, WFSection2d sections, integrations, and members | `if AnalysisType == 'Pushover'` creates lateral pattern/loads. `for` loops perform gravity/pushover stepping. Geometry is direct, but skipping conditions loses loads. |
| [FRP confined column](https://openseespydoc.readthedocs.io/en/latest/src/ExampleFRP.html) | Explicit circular fiber patches, four nodes, spring and beam members; long explicit displacement protocol | `for ControlNode in ControlNodeID` creates lateral loads. Later displacement-step `for` drives cyclic analysis. Uses extensive `*list` argument expansion. |
| [Cantilever earthquake](https://openseespydoc.readthedocs.io/en/latest/src/Canti2DEQ.html) | Direct cantilever model, gravity and earthquake patterns | Response-validation conditional; motion comes from `A10000.dat`. No geometry loop. |
| [RC earthquake](https://openseespydoc.readthedocs.io/en/latest/src/RCFrameEarthquake.html) | Imports RC gravity model and `ReadRecord` helper; adds excitation | `ReadRecord` parses a motion file with loops/conditions. Main `while/if` loops step analysis and recover convergence. Multi-file import is required even before loop support matters. |
| [Namespaced nonlinear SDOF](https://openseespydoc.readthedocs.io/en/latest/src/exampleNamedSpacedNonlinearSDOF.html) | Whole model built in a response function, invoked twice for nonlinear/elastic comparisons | Class-based constants, functions, keyword/default arguments, main guard, conditional file/network acquisition, list comprehensions, NumPy/eqsig. Response `while` needs real time progression; ends with `wipe`. Needs model-case selection. |
| [RotD spectra](https://openseespydoc.readthedocs.io/en/latest/src/exampleRotDSpectra.html) | Nested motion/period loops rebuild a 3D oscillator; inner loop creates excitation patterns | Numerical-array iteration, helper loaded with `exec(open(...).read())`, dictionaries, slicing, file inputs. Later loops rotate responses; `while/if` handles analysis. Produces many models rather than one intended import. |
| [Nonlinear MDOF](https://openseespydoc.readthedocs.io/en/latest/src/NonlinearMDOF.html) | Direct 1D nodes, materials, zero-length springs, and excitation | No main-script control flow. Eigen results enter damping; NumPy and a plotting helper process outputs. `ndm=1` is outside PySees's model dimensions. Ends with `wipe`. |
| [Moving-mesh dam break](https://openseespydoc.readthedocs.io/en/latest/src/dambreak.html) | Boundary nodes explicit; `mesh('line'/'tri')` creates remaining nodes/elements | `for getNodeTags('-mesh', ...)` fixes generated boundary nodes. `while/if` remeshes and advances fluid analysis. Requires mesh behavior and queries, beyond language loops. |
| [Moving-mesh elastic obstacle](https://openseespydoc.readthedocs.io/en/latest/src/elasticobstacle.html) | Direct boundary/beam endpoints; beam/fluid/wall meshes generated by OpenSees | Loops assign generated-node masses and supports. Per-node `-ndf` differs; transient loop also remeshes. |
| [Background-mesh dam break](https://openseespydoc.readthedocs.io/en/latest/src/dambreakbg.html) | Particle/background mesh plus boundary-line mesh | Iterates returned wall-node IDs to fix nodes; analysis `while/if`. Function-return values are required for model construction. |
| [Background-mesh obstacle](https://openseespydoc.readthedocs.io/en/latest/src/elasticobstaclebg.html) | Particle mesh and generated structural line mesh | `if/else` selects elastic/fiber section; loops fix mesh nodes and assign mass. Generated tag sets and mesh return values feed commands. |
| [3D background-mesh dam break](https://openseespydoc.readthedocs.io/en/latest/src/dambreak3Dexample.html) | Explicit boundary corners; line/quad/particle/background meshes | Nested iteration collects mesh-node groups; another loop fixes them. `while/if` is transient analysis. |
| [Laterally loaded pile](https://openseespydoc.readthedocs.io/en/latest/src/pile.html) | Loops generate soil/pile nodes, spring materials/elements, supports, equalDOF links, and beam members | Numeric loops, nested conditionals, three mathematical helper functions with return values and table interpolation. Switches builder from 3D/3 DOF to 3D/6 DOF in the same domain. |
| [Effective-stress soil column](https://openseespydoc.readthedocs.io/en/latest/src/freeFieldEffective.html) | Nested layer/node/element loops, computed material selection and drainage supports | List/NumPy-array calculations and mutation, nested `for/if`, mixed 2/3 DOF builders, material/permeability staging. Motion file and time-step calculations; recovery `if` after analysis. |
| [PM4Sand cyclic test](https://openseespydoc.readthedocs.io/en/latest/src/pm4sand_cyc_cal.html) | Four explicit nodes and one soil element; subsequent supports and patterns change during the test | `for` removes drainage constraints; nested `while/if` depend on stress/displacement responses. Prescribed vertical displacement itself comes from an analysis result. Initial model can be separated; full evolving loading cannot be resolved by arithmetic alone. |
| [Thermal beam](https://openseespydoc.readthedocs.io/en/latest/src/beamThermal.html) | Direct nodes, thermal material/section/members and loads | `for` plus analysis-failure `if` only. Thermal commands are a separate compatibility concern. |
| [Parallel hello 1](https://openseespydoc.readthedocs.io/en/latest/src/hello.html) | No structural model | Rank-dependent `if`; tests parallel runtime metadata. |
| [Parallel hello 2](https://openseespydoc.readthedocs.io/en/latest/src/hello2.html) | No structural model | `for` and `if/elif/else` demonstrate send/recv and broadcast. |
| [Parallel truss](https://openseespydoc.readthedocs.io/en/latest/src/paralleltruss.html) | Rank branches define different node/member subsets | `getPID/getNP` control `if/else`; shared node tags and partitioned domains. Import needs a partition policy, not a guessed rank. |
| [Parallel Tri31](https://openseespydoc.readthedocs.io/en/latest/src/paralleltri31.html) | Rank-dependent boundary nodes and generated mesh; rank branches define supports/loads | Process metadata enters coordinates/tags; `if` selects end constraints. Mesh generation and distributed-domain semantics are additional barriers. |
| [Parallel parameter study](https://openseespydoc.readthedocs.io/en/latest/src/paralleltruss2.html) | Truss commands direct; rank conditional selects Young's modulus | `if/else` changes model parameters before definitions. Different ranks represent different cases, unlike the partitioned truss. |
| [Cantilever sensitivity](https://openseespydoc.readthedocs.io/en/latest/src/CantileverSensitivity2D_v1.html) | Explicit endpoints and section; `mesh('line', ...)` generates beam elements | Loops set sensitivity parameters and collect/plot results; analysis helper function. Mesh creation, not a geometry loop, is the main entity-generation issue. |
| [Steel-frame sensitivity](https://openseespydoc.readthedocs.io/en/latest/src/SteelFrameSensitivity2D_v1.html) | Direct nodes and members; section properties unpacked from dictionary entries | Loops attach sensitivity parameters; helper functions and `while/if` drive analyses; plot loops. Dictionary lookup is needed even though geometry is not in control flow. |

## Python plotting links

The [vfo entry](https://openseespydoc.readthedocs.io/en/latest/src/ModelRendering.html) points to a separate library documentation site; it does not supply a model-building script. The [opsvis entry](https://openseespydoc.readthedocs.io/en/latest/src/opsvisExample.html) points to these six concrete examples, all inspected:

| Example | Entity definition and control flow |
|---|---|
| [2D portal](https://opsvis.readthedocs.io/en/latest/ex_2d_portal_frame.html) | Nodes/members direct; dictionary iteration creates element loads. |
| [3D cantilever](https://opsvis.readthedocs.io/en/latest/ex_3d_3el_cantilever.html) | Nodes, members, and loads direct; no Python control-flow blocks. |
| [Quad grid](https://opsvis.readthedocs.io/en/latest/ex_quads_4x4.html) | Grid nodes/elements explicitly enumerated; no Python control-flow blocks. |
| [Fiber sections](https://opsvis.readthedocs.io/en/latest/ex_plot_fiber_section.html) | Section geometry encoded as nested command-data lists; section construction delegated to `opsvis.fib_sec_list_to_cmds`. No script-level loop. A non-OpenSees library call can still generate entities. |
| [Portal animation](https://opsvis.readthedocs.io/en/latest/ex_2d_portal_frame_th_mode_anim.html) | Model direct; nested step/element loops collect transient response for animation. |
| [Soil–structure portal](https://opsvis.readthedocs.io/en/latest/ex_2d_ssi_portal_frame.html) | Explicit nodes, springs, and frame members; fiber sections delegated to the same command-list helper. No script-level loop. |

## OpenSees Tcl: basic manual

| Example | Entity definition | Relevant control flow/dependencies |
|---|---|---|
| Truss | Explicit four nodes and three trusses | None in model generation. |
| Moment curvature | Direct material/fiber section; procedure creates test nodes, constraints, element, and patterns | `proc` with default argument; invoked after section definition. |
| RC portal gravity | Explicit nodes, sections, members, gravity loads | No model-generation control flow. |
| RC portal pushover | `source RCFrameGravity.tcl`; local lateral loads | Analysis `while/if` uses response and convergence. |
| RC portal earthquake | Same sourced model, motion-reader procedure | Reader uses `foreach/if`, file I/O and `upvar`; main analysis uses `while/if`. |
| Elastic frame | Explicit nodes/members, arithmetic properties | Direct model; no geometry loop in the downloaded basic version. |
| Steel frame | Basic-manual page missing | Available legacy steel variants below establish section/spring procedure requirements. |
| Simply supported continuum beam | `block2D` generates nodes/elements | `if` chooses element variant; `fixY` selects supports by coordinates. Later `remove loadPattern` changes loading. |
| Cantilever earthquake | Direct model | Motion file, no model-generation loop. |
| Two-story shear-frame eigen analysis | Direct nodes/members/masses | `for` creates recorders; `foreach` calculates/writes periods. Loops are output-only. |
| Two-story one-bay-frame eigen analysis | Direct nodes/members/masses | Same recorder/period loops; no geometry loop. |

Source pages and downloads are recorded individually in the inventory. These basic cases show why “contains a loop” and “requires a loop to import the model” must be separate classifications.

## OpenSees Tcl: advanced manual

Each downloadable build variant and analysis script is listed separately in the inventory; this table explains their roles.

| Family | Entity definition | Control flow needed for import |
|---|---|---|
| 1a cantilever / 1b portal, Push and EQ | Direct numeric nodes/members and load blocks | No model-generation loops. EQ damping uses `eigen`, independently of explicit geometry/loads. |
| 2a elastic / 2b uniaxial section / 2c fiber cantilever, Push and EQ | Variables/arithmetic; sections direct | Model construction direct. Analysis recovery introduces `while/if`; fiber patch/layer commands are geometric factories, not Tcl loops. |
| 3 cantilever: elastic, inelastic section, fiber variants | Direct entities and computed properties; separate analysis files | Model construction direct in inspected build files. Analysis uses `while/if`; units are often locally defined in this family. |
| 4 portal: three build variants | Direct entities and computed fiber sections; sourced units | Analysis files use `foreach` to apply lateral loads and multiple-support/bidirectional excitation; `for/foreach` for cyclic protocols and `while/if` for convergence. |
| 5 fixed 2D frame: elastic, uniaxial, RC fiber, W fiber | Nodes and members explicitly enumerated | `source` units/materials and section `proc` calls; RC fiber file conditionally selects Elastic/Fiber. Analysis load distribution uses loops; later convergence loops need not generate geometry. |
| 6 generic 2D frame: four section variants | Nested story/bay `for` loops create nodes, supports, columns, beams, mass and gravity loads | `if/else` for edge/interior/roof properties; `lappend`, `lindex` and computed tag arithmetic. RC/W helpers and includes. Static lateral-load `foreach` iterates paired node/force lists. |
| 7 fixed 3D frame: RC and W variants | Nodes/members explicitly enumerated, floor constraints authored | `if/elseif/else` chooses section type; sourced units/materials and section procedures. Analysis `for` loops create floor/node loads; paired-list `foreach` creates multi-support/bidirectional excitation. |
| 8 generic 3D frame: RC and W variants | Triple frame/story/pier loops generate model; additional loops create diaphragm nodes, restraints, members, masses, gravity loads | Same list/condition/helper requirements as family 6, plus optional diaphragm branching and more dimensions. Some RC builder code evaluates eigenvalues before later load definitions. |
| 9 section examples: uniaxial, W, rectangular RC, circular RC, hollow 3D; 2D/3D variants | Section/fiber geometry authored directly with computed parameters and sourced units | Geometry generally does not need a Tcl loop. Sourced MomentCurvature2D/3D procedures create test nodes/element/patterns and perform analysis; internal recovery uses `while/for/if`. |

The critical Tcl `foreach` form is **parallel iteration over multiple lists**, not only `foreach tag $tags`: the examples pair node IDs with force values and support IDs with motion parameters. Procedure scope, default arguments, return values, and execution of section/pattern bodies also matter. Display procedures contain additional `if` logic but do not create the structural model.

## OpenSees Tcl: legacy scripts and utilities

| Scripts | Entity definition and control flow |
|---|---|
| Example3.1 | Direct RC portal geometry/fiber section. |
| Example3.2 / Example3.3 | Source Example3.1; pushover/transient `while/if`; earthquake also sources a motion-reader procedure. |
| Example4.1 | `for` loops create multi-bay nodes, supports, columns, beams and loads; `if/else` selects edge properties. Later `while/if` is pushover recovery. Official-repository copy inspected. |
| RCFrame1 / RCFrame2 / RCFrame3 | Direct nodes/members/sections. RCFrame1 has analysis `while/if`; RCFrame2 defines a load-control procedure with `for`; display `if/source` is optional. RCFrame3 has no script-level flow. |
| RCFrame4 / RCFrame5 | Direct nodes; `if` selects linear/nonlinear material, section and element definitions. RCFrame5 also conditionally selects excitation. The recovered RCFrame5 does **not** invoke genPlaneFrame despite the index's dependency note. |
| PortalFrame | Direct nodes; sources and invokes RCcircSection to create the fiber section. Later conditionals select static/dynamic analysis and load control. |
| SteelFrame1 | Direct geometry; sourced rotSpring2D procedure creates spring elements and equalDOF constraints. |
| SteelFrame2 | Direct geometry and springs; optional display condition. |
| SteelFrame3 | Direct geometry; sourced Wsection procedure creates fiber section. Optional display condition. |
| Example5.1 / RigidFrame3D | Explicit 3D nodes and members; sourced RCsection helper. Example5.1 has transformation-selection `if` and a `foreach` that creates floor masses. Official-repository Example5.1 inspected. |
| ZeroLength1 / ZeroLength2 / ZeroLength4 | Direct nodes, materials, springs and loading; no model-generation control flow. |
| ZeroLength3 / ZeroLength5 | Sourced rotSpring2D helper creates springs/constraints; remaining model direct. |
| Example2.1 | Fiber section directly authored; sources MomentCurvature procedure, which creates the test rig and loads. |
| Example6.1 | Conditional quad-type selection plus `block2D` meshing. Official-repository copy inspected. |
| Example7.1 / Example8.1 | `block2D` shell and `block3D` solid generation respectively; no geometry language loop required. Official-repository copies inspected. |
| solid01 | Old download unavailable and no matching official-repository file found; unclassified. |
| matTest | Direct 1D truss model and file-driven prescribed displacement; no language loops. |
| Wsection / RCsection | Procedures compute geometry and emit section/patch/layer commands. No procedural loop is needed for the patches themselves. |
| RCcircSection | Procedure with conditional early `return` when reinforcement is absent. |
| RCsectionFEDEAS / RCcircSectionFEDEAS | Section procedures plus file-output side effects; reinforcement `if` and early return in circular variant. |
| genPlaneFrame | Procedure with nested `foreach` and `for`; list lengths determine geometry, restraints and member connectivity. |
| rotSpring2D | Procedure emits zeroLength element and equalDOF. |
| MomentCurvature | Procedure with default argument emits nodes/constraints/element and load patterns, with analysis interleaved. |
| ReadSMDFile | Procedure uses `foreach`, `if`, `catch`, file reads/writes and `upvar` to return motion metadata. |
| RCFrameDisplay / StFramePZLdisplay / RigidFrame3Ddisplay | Display-only commands and conditions; no structural entities. |

## OpenSees Tcl: practical examples and other linked collections

| Example | Entity definition / control flow | Additional boundary |
|---|---|---|
| Centrifuge test | Page excerpts show explicit soil/spring entities and mixed-DOF interfaces; `while/if` adapts analysis time step | No complete downloadable script was linked in retrieved content; conclusions limited to excerpts. |
| Laterally loaded pile | Loop-generated nodes, spring materials/elements, pile members; parameter-returning procedures | Sourced helper files and mixed 3/6 DOF domain. |
| 1D consolidation | Nested `for` generates 2D column mesh; `switch` selects drainage boundary | Tcl arrays and mixed 2/3 DOF; coupled soil elements. |
| Total-stress soil response, single/dependent/independent variants | Nested layer/node/element loops with arrays and conditionals | Constitutive-model variants and staged analysis; motion files. |
| Effective-stress soil response | Nested layer/mesh loops and array-driven material assignment | Mixed DOF, material/permeability updates, some nodal force generation after gravity; external motion file. |
| Dynamic effective-stress slope | Thousands of explicit nodes/elements; `for` changes element material stage, `foreach` reads tag lists | Mixed DOF and external node-list files; `eval` mainly builds recorders. Large model does not imply loop-generated geometry. |
| GiD problem types | Archive contains generator templates and short Tcl helper procedures | A model-generation tool rather than a ready model script; loops in templates must not be mistaken for ordinary OpenSees input. |
| Sheet-pile excavation | Many explicit entities; loops for restraints and staged removal/load changes | External lists, contact/soil elements, mixed DOF, excavation stages with `remove` commands. Requires snapshot selection. |
| 3D sloping-ground soil response | Nested layer/node/element `for`, arrays and conditions | Mixed 3/4 DOF, soil constitutive staging and motion file. |
| Lateral-spreading pile | Explicit nodes/materials/members; `foreach` reads tag lists | Mixed 3/6 DOF; loading stages and external lists; `eval` primarily for recorders. |
| Infill wall/removal | Generic 3D frame nested loops and section helper; loops distribute mass/loads | Sourced unit/material/section files, specialized wall/removal behavior and analysis helper. |
| Two-story moment-frame pushover, concentrated/distributed variants | Direct frame nodes/members; sourced hinge/section/leaning-column helpers | Procedure support required even with no geometry loop; analysis conditions. |
| Two-story moment-frame dynamic | Direct geometry; same sourced spring helpers | Ground-motion file and analysis `if` recovery. |
| Two-story panel-zone/RBS frame | Direct nodes; helpers create panel-zone elements and springs | Several sourced procedures create substantial parts of the model; analysis conditions. |
| One-story viscous-damper frame | Direct nodes, members, dampers and excitation | No script-level control flow in supplied Tcl model. |
| Parallel parameter study | `foreach` reads ground-motion jobs; rank `if`; sourced model and analysis files | ModelSP1 wraps model definitions in a constant `if`; driver repeatedly wipes/rebuilds cases. |
| SCBF | Explicit main nodes plus loop-generated brace subdivision; section helper procedures; outer model-option `foreach` and section `if` | Multiple model cases; imperfection math; sourced helper/motion files. |
| Mega-Tall Model1 | Six model/load/constraint files explicitly enumerate entities; CPU/GPU drivers source them | Available archive inspected: no geometry loops in those six files. Driver `while/if` is convergence recovery. Model2 source was not available from retrieved link set. |
| Earthquake in any direction | Explicit 3D nodes/members using rotation/trigonometric expressions | No model-generation loop. Nested expressions, inline time-series syntax, motion file. |
| Simple parallel parameter study | Nested `foreach` over scale factors and files; rank `if` and sources | Page intentionally omits model/analysis file implementations; cannot classify their geometry. |
| Rigid diaphragm consequences | Three nested `foreach` rebuild different element/material/constraint cases; `if` chooses constraints/materials | Multiple model snapshots; response comparisons are analysis-only. |
| Calling Matlab | Initial area returned by a procedure calling Matlab; direct truss commands; response-controlled parameter-search `while/if` | External executable and analysis response affect model parameters; not achievable with language-only browser import. |
| New-site elastic column pushover / dynamic | Direct model and load blocks | No model-generation loop; dynamic motion file and eigen-derived damping. |

Practical entries link through the [OpenSees examples index](https://opensees.berkeley.edu/wiki/index.php/Examples); each downloaded source or archive is linked in the inventory. Five [Tcl sensitivity examples](https://opensees.berkeley.edu/wiki/index.php?title=Tcl_input_files_for_the_provided_application_examples:) were also inspected:

| Sensitivity example | Definitions and flow |
|---|---|
| 1: 2D soil column | Direct small mesh in DDM; FFD variants rebuild it inside perturbation `foreach`. |
| 2: 3D soil block | Direct solid mesh in DDM; FFD variants rebuild inside `foreach`. |
| 3: 2D RC frame | Direct fiber-section/frame definitions; FFD material-perturbation `foreach`. |
| 4: 3D RC frame | RCsection procedure and floor-mass `foreach`; FFD outer `foreach` creates several models. |
| 5: dam/reservoir/foundation | Large explicit meshes across sourced files; DDM `for` loops attach parameters; FFD outer `foreach` and mixed 1/3 DOF builders. |

## Implications for PySees

The existing readers already evaluate selected constants/arithmetic and Python list expressions. Tcl top-level `incr` works; loops/procedures/conditions do not. Tcl `source` is not followed, Python local imports are not followed, Python dictionaries/attribute values/augmented assignment are outside the current evaluator, and OpenSees mesh commands have explicit unsupported diagnostics. The builder fixes one model configuration, uses the first usable model command, and ignores `wipe`; this is particularly relevant to scripts that rebuild models or wipe them after analysis.

The corpus suggests separating five capabilities before choosing an implementation:

1. **Language evaluation:** nested numeric/list loops; comparisons and boolean conditions; assignment updates; list/dictionary/Tcl-array access; helper calls, return values, defaults and scope. Tcl additionally needs paired-list `foreach` and command substitution. Loops must retain source locations.
2. **Project inputs:** a selected entry script with user-supplied sibling modules, sourced files and motion/data files. Importing files individually cannot reproduce shared scope, order or procedure definitions.
3. **Model generation APIs:** expand supported `mesh`, `block2D/block3D`, coordinate-selected supports and model-query calls, or report unsupported operations. A full language runtime alone cannot implement these OpenSees behaviors.
4. **Snapshot semantics:** decide which model/case/stage to capture when a script rebuilds, wipes, removes or changes entities. Also define how to handle mixed-DOF domains, which conflict with the current single immutable configuration.
5. **Solver boundaries:** skip independent analysis/output work while retaining resolvable later model commands; diagnose branches or loads that depend on actual solver responses. Returning fake success/time/displacement values would change model construction or make loops nonterminating.

For a future coverage experiment, use separate outcomes for geometry, sections/materials, constraints/masses, and loads. Mark missing includes, unsupported language, unsupported model commands, and solver dependencies separately. The source audit supports testing PortalFrame2d, Tcl generic 2D frame, section/spring helpers, and the RC multi-file examples first. A single pass/fail “script import” count would conceal the main failure modes.
