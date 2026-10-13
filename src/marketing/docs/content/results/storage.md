---
title: Results storage
description: Where results live and when they are discarded.
order: 9
keywords: indexeddb storage invalidate stale results
---

Results are stored in your browser (IndexedDB), written as the analysis runs and read back one step at a time for display. They are not part of the model or the saved project.

**Editing the model or the analysis list discards stored results**, because they would no longer match. Opening a project also starts without results.

Run states: running, complete, failed, cancelled, storage-failed and interrupted.
