#!/usr/bin/env python3
"""
Build runtime command schema definitions from extracted OpenSeesPy candidates.

Usage:
  uv run python scripts/build_runtime_schemas.py \
    --input src/generated/opensees-schema-candidates.json \
    --output src/generated/commandSchemas.generated.ts
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def to_camel(name: str) -> str:
  parts = re.split(r"[^A-Za-z0-9]+", name.strip())
  parts = [p for p in parts if p]
  if not parts:
    return "arg"
  head = parts[0]
  tail = [p[:1].upper() + p[1:] for p in parts[1:]]
  return head[:1].lower() + head[1:] + "".join(tail)


def sanitize_name(name: str) -> str:
  n = name.strip().strip("*").strip("'\"")
  n = re.sub(r"[^A-Za-z0-9_]+", "_", n).strip("_")
  if not n:
    return "arg"
  if re.match(r"^\d", n):
    n = f"v_{n}"
  return to_camel(n)


def infer_len(name: str) -> Any:
  lower = name.lower()
  if any(k in lower for k in ("coord", "crd", "xyz")):
    return "ndm"
  if any(k in lower for k in ("dof",)):
    return "ndf"
  return "dynamic"


def normalize_arg(arg: dict[str, Any]) -> dict[str, Any]:
  kind = arg.get("kind", "str")
  name = sanitize_name(str(arg.get("name", "arg")))
  out: dict[str, Any] = {"kind": kind, "name": name}
  if "literal" in arg:
    out["literal"] = arg["literal"]
  if kind == "vec":
    out["length"] = arg.get("length", infer_len(name))
  return out


def stable_unique_args(args: list[dict[str, Any]]) -> list[dict[str, Any]]:
  seen: set[str] = set()
  out: list[dict[str, Any]] = []
  for arg in args:
    key = json.dumps(arg, sort_keys=True)
    if key in seen:
      continue
    seen.add(key)
    out.append(arg)
  return out


def build_command_schema(fn: str, variants: list[dict[str, Any]]) -> dict[str, Any]:
  parsed: list[dict[str, Any]] = []
  for v in variants:
    args = [normalize_arg(a) for a in v.get("argsInferred", [])]
    parsed.append({"signature": v.get("signature", ""), "args": args, "examples": v.get("examples", [])})

  literal_first = []
  non_literal = []
  for p in parsed:
    if p["args"] and p["args"][0].get("kind") == "str" and "literal" in p["args"][0]:
      literal_first.append(p)
    else:
      non_literal.append(p)

  schema: dict[str, Any] = {
    "fn": fn,
    "label": fn,
    "category": "recorder" if fn.lower().startswith("recorder") else "model",
    "args": [],
    "optional": [],
    "signatures": [p["signature"] for p in parsed],
    "examples": sorted(
      {(e["file"], e["line"]) for p in parsed for e in p["examples"] if "file" in e and "line" in e},
      key=lambda t: (t[0], t[1]),
    ),
  }

  if literal_first and len({p["args"][0]["literal"] for p in literal_first}) >= 2:
    choice_name = {
      "element": "eleType",
      "uniaxialMaterial": "matType",
      "beamIntegration": "type",
      "recorder": "recorderType",
    }.get(fn, "type")
    yields: dict[str, list[dict[str, Any]]] = {}
    for p in literal_first:
      lit = str(p["args"][0]["literal"])
      yields.setdefault(lit, [])
      yields[lit].extend(p["args"][1:])
      yields[lit] = stable_unique_args(yields[lit])
    schema["args"] = [{
      "kind": "choice",
      "name": choice_name,
      "options": sorted(yields),
      "yields": {k: yields[k] for k in sorted(yields)},
      "defaultValue": sorted(yields)[0],
    }]
    if non_literal:
      base_generic = min(non_literal, key=lambda p: len(p["args"]))["args"]
      generic_args = list(base_generic)
      if generic_args and generic_args[0].get("kind") == "str":
        first_name = str(generic_args[0].get("name", "")).lower()
        if "type" in first_name or first_name == choice_name.lower():
          generic_args = [{"kind": "str", "name": "customType"}] + generic_args[1:]
      yields["user-supplied"] = stable_unique_args(generic_args)
      schema["args"][0]["options"] = sorted(yields)
      schema["args"][0]["yields"] = {k: yields[k] for k in sorted(yields)}
  else:
    # Pick shortest signature as base (usually core form)
    base = min(parsed, key=lambda p: len(p["args"])) if parsed else {"args": []}
    schema["args"] = base["args"]

  return schema


def to_ts_literal(obj: Any, indent: int = 0) -> str:
  pad = "  " * indent
  if obj is None:
    return "null"
  if isinstance(obj, bool):
    return "true" if obj else "false"
  if isinstance(obj, (int, float)):
    return repr(obj)
  if isinstance(obj, str):
    return json.dumps(obj)
  if isinstance(obj, list):
    if not obj:
      return "[]"
    parts = ",\n".join(f"{'  ' * (indent + 1)}{to_ts_literal(v, indent + 1)}" for v in obj)
    return "[\n" + parts + "\n" + pad + "]"
  if isinstance(obj, tuple):
    return to_ts_literal(list(obj), indent)
  if isinstance(obj, dict):
    if not obj:
      return "{}"
    items = []
    for k in sorted(obj):
      v = obj[k]
      key = k if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", k) else json.dumps(k)
      items.append(f"{'  ' * (indent + 1)}{key}: {to_ts_literal(v, indent + 1)}")
    return "{\n" + ",\n".join(items) + "\n" + pad + "}"
  raise TypeError(f"unsupported type: {type(obj)}")


def main() -> None:
  parser = argparse.ArgumentParser(description="Build runtime schemas from extracted OpenSees candidates.")
  parser.add_argument("--input", type=Path, default=Path("src/generated/opensees-schema-candidates.json"))
  parser.add_argument("--output", type=Path, default=Path("src/generated/commandSchemas.generated.ts"))
  args = parser.parse_args()

  data = json.loads(args.input.read_text(encoding="utf-8"))
  commands = data.get("commands", {})
  schemas = [build_command_schema(fn, variants) for fn, variants in sorted(commands.items(), key=lambda kv: kv[0].lower())]

  output = f"""/* eslint-disable */
// Auto-generated by scripts/build_runtime_schemas.py. Do not edit manually.

export type GeneratedArgDef =
  | {{ kind: 'int' | 'float' | 'str'; name: string; literal?: string }}
  | {{ kind: 'vec'; name: string; length: number | 'ndm' | 'ndf' | 'dynamic' }}
  | {{ kind: 'choice'; name: string; options: string[]; yields: Record<string, GeneratedArgDef[]>; defaultValue?: string }}

export interface GeneratedCommandSchema {{
  fn: string
  label: string
  category: 'model' | 'recorder'
  args: GeneratedArgDef[]
  optional: GeneratedArgDef[]
  signatures: string[]
  examples: Array<[string, number]>
}}

export const GENERATED_COMMAND_SCHEMAS: GeneratedCommandSchema[] = {to_ts_literal(schemas)};
"""

  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(output, encoding="utf-8")
  print(f"Wrote {args.output} ({len(schemas)} schemas)")


if __name__ == "__main__":
  main()
