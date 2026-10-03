import type { MaterialProbeError, WasmMaterialProbe } from '@/app/carapace/wasm/carapace_wasm.js'
import type { MaterialEntity } from '@/app/types/model'
import type { CompileDiagnostic } from '@/app/lib/compileAnalysisSequence'
import { compileMaterial } from '@/app/lib/carapace/compileInputV1'

type Wasm = typeof import('@/app/carapace/wasm/carapace_wasm.js')

let wasmModule: Promise<Wasm> | null = null
function loadWasm(): Promise<Wasm> {
  wasmModule ??= import('@/app/carapace/wasm/carapace_wasm.js').then(async (mod) => {
    await mod.default()
    return mod
  })
  return wasmModule
}

export interface MaterialPreviewPoint { eps: number; sig: number }

export interface RunMaterialPreviewOptions {
  isCancelled: () => boolean
}

const BATCH_MS = 50

function describeProbeError(error: unknown): string {
  const e = error as Partial<MaterialProbeError> | undefined
  switch (e?.kind) {
    case 'unsupportedMaterial': return `The ${e.material} material is not supported by the material preview yet.`
    case 'invalidTarget': return `Strain ${e.target} is not a finite number.`
    case 'invalidProbe': return `Invalid material: ${e.reason}`
    case 'solverFailure': return `Solver failed at strain ${e.target}: ${e.detail}`
    default: return error instanceof Error ? error.message : String(error)
  }
}

/** Drives a Carapace uniaxial material probe (a unit zero-length spring under prescribed strain)
 * through `protocol`, returning every `{ eps, sig }` point at once so the UI renders a single update. Yields to the
 * event loop periodically so the page stays responsive and cancellation takes effect; a cancelled
 * run resolves with the points computed so far. Throws an Error with a
 * user-presentable message. */
export async function runMaterialPreview(material: MaterialEntity, protocol: number[], { isCancelled }: RunMaterialPreviewOptions): Promise<MaterialPreviewPoint[]> {
  const diagnostics: CompileDiagnostic[] = []
  const spec = compileMaterial(material, diagnostics)
  const failure = diagnostics.find((d) => d.severity === 'error')
  if (failure) throw new Error(failure.message)

  const wasm = await loadWasm()
  let probe: WasmMaterialProbe | null = null
  try {
    probe = wasm.createMaterialProbe({ material: spec })
    const points: MaterialPreviewPoint[] = []
    let sliceStart = performance.now()
    for (const target of protocol) {
      if (isCancelled()) break
      const { strain, stress } = probe.applyStrain(target)
      points.push({ eps: strain, sig: stress })
      if (performance.now() - sliceStart >= BATCH_MS) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        sliceStart = performance.now()
      }
    }
    return points
  } catch (error) {
    throw new Error(describeProbeError(error), { cause: error })
  } finally {
    probe?.free()
  }
}
