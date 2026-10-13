---
title: Troubleshooting
description: Common problems and fixes.
order: 2
keywords: faq error problem fix run fails no results eigen modes
---

## The run stops with an error

Expand the diagnostics under the status bar. Typical causes:

- **A material, pattern or time series Carapace doesn't support.** Use a supported type. See [Supported features](/docs/carapace/supported-features).
- **"requests N modes but the model has mass on only M free DOFs".** Assign [masses](/docs/model/nodes-masses) or request fewer modes.
- **"Model has loads but the analysis sequence has no stages".** Add a static, pushover or earthquake block.
- **A 3D beam has no `vecxz`, or a fiber section has no `-GJ`.** Add it. See [Transformations](/docs/model/transformations).

## Nothing to show after running

Results need the [Whole Model Recorder](/docs/analysis/recorder) before the stages. Editing the model afterwards discards results; run again.

## A project won't open

Opening is strict about `# @pysees` blocks and reports the line. Files without the header are imported as models only. See [Save and open](/docs/files/save-open-projects).

## Part of my imported script is missing

The importer reads the script without running it. Loops, conditionals and procedures are skipped and listed in the import dialog.
