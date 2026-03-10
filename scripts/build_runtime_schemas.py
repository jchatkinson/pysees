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


def normalize_key(name: str) -> str:
  return re.sub(r"[^a-z0-9]", "", name.lower())


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
  for key in ("description", "required", "defaultSource"):
    if key in arg:
      out[key] = arg[key]
  if "defaultValue" in arg:
    out["defaultValue"] = arg["defaultValue"]
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


def short_description(text: str) -> str:
  clean = re.sub(r"\s+", " ", text).strip()
  if not clean:
    return ""
  m = re.match(r"^(.+?[.!?])\s", clean)
  if m:
    return m.group(1).strip()
  return clean if len(clean) <= 180 else f"{clean[:177].rstrip()}..."


def coerce_default(kind: str, value: Any) -> Any | None:
  if value is None:
    return None
  if kind == "int":
    if isinstance(value, bool):
      return None
    if isinstance(value, (int, float)):
      return int(value)
    if isinstance(value, str) and re.match(r"^-?\d+$", value.strip()):
      return int(value.strip())
    return None
  if kind == "float":
    if isinstance(value, bool):
      return None
    if isinstance(value, (int, float)):
      return float(value)
    if isinstance(value, str) and re.match(r"^-?(?:\d+\.\d*|\d*\.\d+|\d+)(?:[eE][+-]?\d+)?$", value.strip()):
      return float(value.strip())
    return None
  if kind == "str":
    return str(value)
  if kind == "vec":
    if isinstance(value, list):
      out: list[float] = []
      for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
          return None
        out.append(float(item))
      return out
    return None
  return None


def lookup_curated_default(curated: dict[str, Any], mat_type: str, arg_name: str) -> Any | None:
  by_material = curated.get("byMaterial", {})
  global_by_name = curated.get("globalByName", {})
  mat_map = by_material.get(mat_type, {}) or by_material.get(normalize_key(mat_type), {})
  if isinstance(mat_map, dict):
    for key, value in mat_map.items():
      if normalize_key(str(key)) == normalize_key(arg_name):
        return value
  if isinstance(global_by_name, dict):
    for key, value in global_by_name.items():
      if normalize_key(str(key)) == normalize_key(arg_name):
        return value
  return None


def apply_uniaxial_arg_metadata(
  arg: dict[str, Any],
  mat_type: str,
  docs_meta: dict[str, Any],
  curated_defaults: dict[str, Any],
) -> dict[str, Any]:
  out = dict(arg)
  mat_meta = docs_meta.get(normalize_key(mat_type), {})
  arg_meta = (mat_meta.get("args", {}) if isinstance(mat_meta, dict) else {}).get(normalize_key(str(arg.get("name", ""))), {})
  if isinstance(arg_meta, dict):
    description = short_description(str(arg_meta.get("description", "")))
    if description:
      out["description"] = description
    if "required" in arg_meta:
      out["required"] = bool(arg_meta["required"])
  kind = str(out.get("kind", "str"))
  default_source = None
  default_value: Any | None = None
  if isinstance(arg_meta, dict) and "defaultFromSignature" in arg_meta:
    default_value = arg_meta.get("defaultFromSignature")
    default_source = "signature"
  elif isinstance(arg_meta, dict) and "defaultFromDescription" in arg_meta:
    default_value = arg_meta.get("defaultFromDescription")
    default_source = "doc_text"
  else:
    default_value = lookup_curated_default(curated_defaults, mat_type, str(arg.get("name", "")))
    if default_value is not None:
      default_source = "curated"
  coerced = coerce_default(kind, default_value)
  if coerced is not None:
    out["defaultValue"] = coerced
    if default_source:
      out["defaultSource"] = default_source
  return out


def build_command_schema(fn: str, variants: list[dict[str, Any]], docs_meta: dict[str, Any], curated_defaults: dict[str, Any]) -> dict[str, Any]:
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
      mapped_args = p["args"][1:]
      if fn == "uniaxialMaterial":
        mapped_args = [apply_uniaxial_arg_metadata(arg, lit, docs_meta, curated_defaults) for arg in mapped_args]
      yields[lit].extend(mapped_args)
      yields[lit] = stable_unique_args(yields[lit])
    schema["args"] = [{
      "kind": "choice",
      "name": choice_name,
      "options": sorted(yields),
      "yields": {k: yields[k] for k in sorted(yields)},
      "defaultValue": "Elastic" if fn == "uniaxialMaterial" and "Elastic" in yields else sorted(yields)[0],
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
  parser.add_argument("--uniaxial-defaults", type=Path, default=Path("scripts/uniaxial-material-defaults.json"))
  args = parser.parse_args()

  data = json.loads(args.input.read_text(encoding="utf-8"))
  commands = data.get("commands", {})
  docs_meta = data.get("uniaxialMaterialDocs", {})
  curated_defaults = {}
  if args.uniaxial_defaults.exists():
    curated_defaults = json.loads(args.uniaxial_defaults.read_text(encoding="utf-8"))
  schemas = [build_command_schema(fn, variants, docs_meta, curated_defaults) for fn, variants in sorted(commands.items(), key=lambda kv: kv[0].lower())]

  output = f"""/* eslint-disable */
// Auto-generated by scripts/build_runtime_schemas.py. Do not edit manually.

export type GeneratedArgDef =
  | {{ kind: 'int' | 'float' | 'str'; name: string; literal?: string; defaultValue?: number | string | number[]; description?: string; required?: boolean; defaultSource?: 'signature' | 'doc_text' | 'curated' }}
  | {{ kind: 'vec'; name: string; length: number | 'ndm' | 'ndf' | 'dynamic'; defaultValue?: number[]; description?: string; required?: boolean; defaultSource?: 'signature' | 'doc_text' | 'curated' }}
  | {{ kind: 'choice'; name: string; options: string[]; yields: Record<string, GeneratedArgDef[]>; defaultValue?: string; description?: string; required?: boolean; defaultSource?: 'signature' | 'doc_text' | 'curated' }}

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
