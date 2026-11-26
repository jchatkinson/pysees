#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
carapace_root="$(cd "$project_root/../carapace" && pwd)"
output_dir="$project_root/src/app/carapace/wasm"
package_dir="$carapace_root/pkg"

cd "$carapace_root"
cargo build -p carapace-wasm --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/carapace_wasm.wasm --out-dir "$package_dir" --target web

install -m 0644 "$package_dir/carapace_wasm.js" "$output_dir/carapace_wasm.js"
install -m 0644 "$package_dir/carapace_wasm.d.ts" "$output_dir/carapace_wasm.d.ts"
install -m 0644 "$package_dir/carapace_wasm_bg.wasm" "$output_dir/carapace_wasm_bg.wasm"
install -m 0644 "$package_dir/carapace_wasm_bg.wasm.d.ts" "$output_dir/carapace_wasm_bg.wasm.d.ts"

# Which Carapace the bundled wasm was built from (read by the verification page generator and its freshness test).
commit="$(git -C "$carapace_root" rev-parse HEAD)"
dirty="$(git -C "$carapace_root" status --porcelain --untracked-files=no | grep -q . && echo true || echo false)"
sha="$(sha256sum "$output_dir/carapace_wasm_bg.wasm" | cut -d' ' -f1)"
printf '{ "commit": "%s", "dirty": %s, "wasmSha256": "%s" }\n' "$commit" "$dirty" "$sha" > "$output_dir/build-info.json"
