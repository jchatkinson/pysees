#!/usr/bin/env python3
"""
Generate command schema candidates from OpenSeesPyDoc RST sources.

Usage:
  uv run python scripts/generate_opensees_schemas.py \
    --docs-root /path/to/OpenSeesPyDoc \
    --output src/generated/opensees-schema-candidates.json \
    --overrides scripts/opensees-schema-overrides.json
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CALL_RE = re.compile(r"(?:^|[^A-Za-z0-9_])(?:ops\.)?([A-Za-z_]\w*)\s*\((.*)\)\s*$")
FUNCTION_DIRECTIVE_RE = re.compile(r"^\s*\.\.\s+function::\s*(.+?)\s*$")
PY_FUNCTION_DIRECTIVE_RE = re.compile(r"^\s*\.\.\s+py:function::\s*(.+?)\s*$")
PARAM_ROW_RE = re.compile(r"^\s*``")
PARAM_TYPE_RE = re.compile(r"\|[^|]+\|\s+(.*)$")
PARAM_NAME_RE = re.compile(r"``([^`]+)``")
DEFAULT_TEXT_RE = re.compile(r"default\s*[=:]\s*([^\s,;)\]]+)", re.IGNORECASE)
OPTIONAL_TEXT_RE = re.compile(r"\(\s*optional\b", re.IGNORECASE)


@dataclass(frozen=True)
class Signature:
  command: str
  args_raw: str
  source: str
  line: int


def split_top_level_args(text: str) -> list[str]:
  parts: list[str] = []
  buf: list[str] = []
  depth = 0
  in_sq = False
  in_dq = False
  escape = False
  for ch in text:
    if escape:
      buf.append(ch)
      escape = False
      continue
    if ch == "\\":
      buf.append(ch)
      escape = True
      continue
    if ch == "'" and not in_dq:
      in_sq = not in_sq
      buf.append(ch)
      continue
    if ch == '"' and not in_sq:
      in_dq = not in_dq
      buf.append(ch)
      continue
    if in_sq or in_dq:
      buf.append(ch)
      continue
    if ch in "([{":
      depth += 1
      buf.append(ch)
      continue
    if ch in ")]}":
      depth = max(depth - 1, 0)
      buf.append(ch)
      continue
    if ch == "," and depth == 0:
      token = "".join(buf).strip()
      if token:
        parts.append(token)
      buf = []
      continue
    buf.append(ch)
  tail = "".join(buf).strip()
  if tail:
    parts.append(tail)
  return parts


def infer_arg(token: str) -> dict[str, Any]:
  t = token.strip()
  if not t:
    return {"kind": "str", "name": "arg"}

  if re.match(r"""^['"][^'"]+['"]$""", t):
    return {"kind": "str", "name": "literal", "literal": t.strip("'\"")}

  if re.match(r"""^['"]-[^'"]+['"]$""", t):
    return {"kind": "flag", "flag": t.strip("'\""), "args": []}

  bare = t.lstrip("*")
  bare = re.sub(r"\s*=.*$", "", bare).strip()
  lower = bare.lower()

  if t.startswith("*"):
    if any(k in lower for k in ("crd", "coord", "xyz", "vec", "dof", "node", "tag", "id")):
      return {"kind": "vec", "name": bare or "values", "length": "dynamic"}
    return {"kind": "vec", "name": bare or "values", "length": "dynamic"}

  if re.match(r"^-?\d+$", bare):
    return {"kind": "int", "name": "value"}
  if re.match(r"^-?\d+\.\d+$", bare):
    return {"kind": "float", "name": "value"}

  if any(k in lower for k in ("tag", "id", "ndm", "ndf", "node", "ele", "mat", "dof", "num")):
    return {"kind": "int", "name": bare or "value"}
  if any(k in lower for k in ("type", "name", "file", "path", "dir")):
    return {"kind": "str", "name": bare or "value"}
  if any(k in lower for k in ("coord", "crd", "x", "y", "z", "mass", "load", "value")):
    return {"kind": "float", "name": bare or "value"}

  return {"kind": "str", "name": bare or "value"}


def normalize_key(value: str) -> str:
  return re.sub(r"[^a-z0-9]", "", value.lower())


def parse_default_scalar(raw: str) -> Any | None:
  token = raw.strip().strip(">").strip("<").strip(".,;:")
  if not token:
    return None
  if (token.startswith("'") and token.endswith("'")) or (token.startswith('"') and token.endswith('"')):
    return token[1:-1]
  low = token.lower()
  if low == "true":
    return True
  if low == "false":
    return False
  if re.match(r"^-?\d+$", token):
    return int(token)
  if re.match(r"^-?(?:\d+\.\d*|\d*\.\d+|\d+)(?:[eE][+-]?\d+)?$", token):
    return float(token)
  return token


def extract_uniaxial_signature(lines: list[str]) -> tuple[str, list[str], int] | None:
  i = 0
  while i < len(lines):
    line = lines[i]
    d = FUNCTION_DIRECTIVE_RE.match(line) or PY_FUNCTION_DIRECTIVE_RE.match(line)
    if not d:
      i += 1
      continue
    sig_text = d.group(1).strip()
    j = i + 1
    while j < len(lines):
      cont = lines[j]
      cont_stripped = cont.strip()
      if not cont_stripped:
        break
      if cont_stripped.startswith(".. "):
        break
      if cont_stripped.startswith(":"):
        break
      if len(cont) - len(cont.lstrip(" ")) == 0:
        break
      sig_text += " " + cont_stripped
      j += 1
    m = CALL_RE.search(sig_text)
    if not m:
      i = j
      continue
    fn = m.group(1)
    if fn != "uniaxialMaterial":
      i = j
      continue
    args = split_top_level_args(m.group(2).strip())
    if not args:
      i = j
      continue
    first = args[0].strip().strip("'\"")
    if not first or normalize_key(first) == "mattype":
      i = j
      continue
    return (first, args, i + 1)
  return None


def parse_signature_defaults(args: list[str]) -> dict[str, Any]:
  out: dict[str, Any] = {}
  for token in args:
    t = token.strip().strip("<>").strip()
    if not t or "=" not in t:
      continue
    left, right = t.split("=", 1)
    name = left.strip().lstrip("*")
    default_value = parse_default_scalar(right)
    if not name or default_value is None:
      continue
    out[normalize_key(name)] = default_value
  return out


def parse_param_table(lines: list[str]) -> dict[str, dict[str, Any]]:
  out: dict[str, dict[str, Any]] = {}
  i = 0
  while i < len(lines):
    line = lines[i]
    if not PARAM_ROW_RE.match(line):
      i += 1
      continue
    names = [n.strip() for n in PARAM_NAME_RE.findall(line)]
    if not names:
      i += 1
      continue
    desc_match = PARAM_TYPE_RE.search(line)
    desc = desc_match.group(1).strip() if desc_match else line.split("``")[-1].strip()
    j = i + 1
    while j < len(lines):
      cont = lines[j]
      stripped = cont.strip()
      if not stripped:
        break
      if PARAM_ROW_RE.match(cont):
        break
      if stripped.startswith(".. ") or stripped.startswith(":"):
        break
      if re.fullmatch(r"[=\s]+", stripped):
        break
      desc += " " + stripped
      j += 1
    clean_desc = re.sub(r"\s+", " ", desc).strip()
    optional = bool(OPTIONAL_TEXT_RE.search(clean_desc))
    default_match = DEFAULT_TEXT_RE.search(clean_desc)
    default_from_desc = parse_default_scalar(default_match.group(1)) if default_match else None
    for raw_name in names:
      normalized = normalize_key(raw_name.strip("'\""))
      if not normalized:
        continue
      existing = out.get(normalized, {})
      if not existing.get("description") and clean_desc:
        existing["description"] = clean_desc
      existing["required"] = not optional
      if default_from_desc is not None:
        existing["defaultFromDescription"] = default_from_desc
      out[normalized] = existing
    i = j
  return out


def extract_uniaxial_docs_metadata(rst_files: list[Path], root: Path) -> dict[str, Any]:
  out: dict[str, Any] = {}
  for rst in rst_files:
    lines = rst.read_text(encoding="utf-8", errors="ignore").splitlines()
    sig = extract_uniaxial_signature(lines)
    if sig is None:
      continue
    mat_type, args, line_no = sig
    mat_key = normalize_key(mat_type)
    signature_defaults = parse_signature_defaults(args)
    table_meta = parse_param_table(lines)
    arg_meta: dict[str, Any] = {}
    for token in args[1:]:
      tok = token.strip().strip("<>").strip()
      if not tok:
        continue
      raw_name = tok.split("=", 1)[0].strip().lstrip("*").strip()
      key = normalize_key(raw_name)
      if not key:
        continue
      meta = dict(table_meta.get(key, {}))
      if key in signature_defaults:
        meta["defaultFromSignature"] = signature_defaults[key]
      if "required" not in meta:
        meta["required"] = True
      meta["name"] = raw_name
      arg_meta[key] = meta
    out[mat_key] = {
      "matType": mat_type,
      "source": str(rst.relative_to(root)),
      "line": line_no,
      "args": arg_meta,
    }
  return out


def extract_signatures(
  rst_path: Path,
  root: Path,
  include_code_calls: bool = False,
  include_inline_calls: bool = False,
) -> list[Signature]:
  lines = rst_path.read_text(encoding="utf-8", errors="ignore").splitlines()
  out: list[Signature] = []

  in_code = False
  code_indent = 0
  i = 0
  while i < len(lines):
    idx = i + 1
    line = lines[i]
    stripped = line.strip()
    d = FUNCTION_DIRECTIVE_RE.match(line) or PY_FUNCTION_DIRECTIVE_RE.match(line)
    if d:
      sig_text = d.group(1).strip()
      # Support wrapped signatures:
      # .. function:: cmd(a,
      #                 b)
      j = i + 1
      while j < len(lines):
        cont = lines[j]
        cont_stripped = cont.strip()
        if not cont_stripped:
          break
        if cont_stripped.startswith(".. "):
          break
        if cont_stripped.startswith(":"):
          break
        if len(cont) - len(cont.lstrip(" ")) == 0:
          break
        sig_text += " " + cont_stripped
        j += 1
      m = CALL_RE.search(sig_text)
      if m:
        out.append(Signature(command=m.group(1), args_raw=m.group(2).strip(), source=str(rst_path.relative_to(root)), line=idx))
      i = j
      continue
    if stripped.startswith(".. code-block::") or stripped.startswith(".. sourcecode::") or stripped.startswith(".. parsed-literal::"):
      in_code = True
      code_indent = -1
      i += 1
      continue
    if in_code:
      if code_indent == -1:
        if not stripped:
          i += 1
          continue
        code_indent = len(line) - len(line.lstrip(" "))
      current_indent = len(line) - len(line.lstrip(" "))
      if stripped and current_indent < code_indent:
        in_code = False
      if not in_code:
        # fallthrough for non-code line handling in same iteration
        pass
      else:
        code_line = line[code_indent:] if len(line) >= code_indent else stripped
        if include_code_calls:
          m = CALL_RE.search(code_line.strip())
          if m:
            out.append(Signature(command=m.group(1), args_raw=m.group(2).strip(), source=str(rst_path.relative_to(root)), line=idx))
        i += 1
        continue

    if include_inline_calls:
      m = CALL_RE.search(stripped)
      if m:
        out.append(Signature(command=m.group(1), args_raw=m.group(2).strip(), source=str(rst_path.relative_to(root)), line=idx))
    i += 1

  return out


def dedupe_signatures(sigs: list[Signature]) -> dict[str, list[dict[str, Any]]]:
  by_cmd: dict[str, dict[str, dict[str, Any]]] = {}
  for sig in sigs:
    args = split_top_level_args(sig.args_raw)
    schema_args = [infer_arg(tok) for tok in args]
    sig_key = ", ".join(args)
    by_cmd.setdefault(sig.command, {})
    if sig_key not in by_cmd[sig.command]:
      by_cmd[sig.command][sig_key] = {
        "signature": f"{sig.command}({sig.args_raw})",
        "argsRaw": args,
        "argsInferred": schema_args,
        "examples": [],
      }
    by_cmd[sig.command][sig_key]["examples"].append({"file": sig.source, "line": sig.line})

  out: dict[str, list[dict[str, Any]]] = {}
  for cmd, variants in by_cmd.items():
    out[cmd] = sorted(variants.values(), key=lambda v: v["signature"])
  return dict(sorted(out.items(), key=lambda kv: kv[0]))


def apply_overrides(data: dict[str, Any], override_path: Path | None) -> dict[str, Any]:
  if not override_path:
    return data
  if not override_path.exists():
    raise FileNotFoundError(f"Override file not found: {override_path}")
  overrides = json.loads(override_path.read_text(encoding="utf-8"))
  merged = dict(data)
  for cmd, payload in overrides.get("commands", {}).items():
    merged[cmd] = payload
  return merged


def main() -> None:
  parser = argparse.ArgumentParser(description="Generate OpenSeesPy command schema candidates from RST docs.")
  parser.add_argument("--docs-root", type=Path, required=True, help="Path to local clone of OpenSeesPyDoc.")
  parser.add_argument("--output", type=Path, default=Path("src/generated/opensees-schema-candidates.json"))
  parser.add_argument("--overrides", type=Path, default=None, help="Optional JSON overrides file.")
  parser.add_argument("--include-code-calls", action="store_true", help="Also parse function-like calls inside code blocks (off by default).")
  parser.add_argument("--include-inline-calls", action="store_true", help="Also parse function-like calls in prose lines (off by default).")
  args = parser.parse_args()

  docs_root = args.docs_root.resolve()
  if not docs_root.exists():
    raise FileNotFoundError(f"docs root not found: {docs_root}")

  rst_files = sorted(docs_root.rglob("*.rst"))
  if not rst_files:
    raise RuntimeError(f"no .rst files found under: {docs_root}")

  signatures: list[Signature] = []
  for rst in rst_files:
    signatures.extend(extract_signatures(rst, docs_root, include_code_calls=args.include_code_calls, include_inline_calls=args.include_inline_calls))

  commands = dedupe_signatures(signatures)
  commands = apply_overrides(commands, args.overrides)
  uniaxial_docs = extract_uniaxial_docs_metadata(rst_files, docs_root)

  payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "source": str(docs_root),
    "rstFilesScanned": len(rst_files),
    "signaturesFound": len(signatures),
    "commands": commands,
    "uniaxialMaterialDocs": uniaxial_docs,
  }

  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
  print(f"Wrote {args.output} ({len(commands)} commands)")


if __name__ == "__main__":
  main()
