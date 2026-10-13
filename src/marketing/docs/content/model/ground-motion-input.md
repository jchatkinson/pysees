---
title: Ground motion records
description: Import an acceleration record into a Path time series.
order: 11
keywords: earthquake AT2 PEER csv acceleration record scale useLast
---

On a **Path** time series, the ground-motion importer reads an acceleration record from a file and fills in the series.

## Supported files

PEER `.AT2`, `.csv`, `.txt` and `.dat`. Files are limited to 32 MB and one million samples. Two sample records, LOS000 and LOS270, are bundled.

## Options

| Option | Meaning |
|---|---|
| Header lines to skip | Lines before the data starts |
| Time column | Whether the file includes a time column |
| Sample interval | Time step when there is no time column |
| Prepend zero | Adds a zero sample at time 0 |
| Linear scale factor | Multiplies the record, for example 9.80665 to convert g to m/s² |
| `-useLast` | Holds the last value after the record ends |

Press **Use this record** to fill the series.

> [!WARNING]
> The scale factor must match your model's units. Check it against the units you chose when creating the model.

Use the series in a UniformExcitation pattern, then run an [earthquake analysis](/docs/analysis/earthquake).
