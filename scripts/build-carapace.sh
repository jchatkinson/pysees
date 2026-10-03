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
