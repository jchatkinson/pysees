type Wasm = typeof import('@/app/carapace/wasm/carapace_wasm.js')

let wasmModule: Promise<Wasm> | null = null
/** The Carapace wasm on the main thread (material preview, building expansion); analysis runs in a worker instead. */
export function loadCarapaceWasm(): Promise<Wasm> {
  wasmModule ??= import('@/app/carapace/wasm/carapace_wasm.js').then(async (mod) => { await mod.default(); return mod })
  return wasmModule
}
