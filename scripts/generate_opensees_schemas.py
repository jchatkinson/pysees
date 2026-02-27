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

  payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "source": str(docs_root),
    "rstFilesScanned": len(rst_files),
    "signaturesFound": len(signatures),
    "commands": commands,
  }

  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
  print(f"Wrote {args.output} ({len(commands)} commands)")


if __name__ == "__main__":
  main()
