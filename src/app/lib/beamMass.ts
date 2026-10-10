import type { Model } from '@/app/types/model'

/** OpenSees -mass is mass per length. Its default beam mass is lumped on translations.
 * Expand it into nodal masses for dynamics, avoiding ElasticBeam2d's double subtraction of
 * the ground-excitation load in getResistingForceIncInertia (OpenSees 3.8).
 * The authored model and its ordinary script-only round trip retain the beam option. */
export function withLumpedBeamMass(model: Model): Model {
  const elements = new Map(model.elements), masses = new Map(model.masses)
  const ndm = model.config?.ndm ?? 2, ndf = model.config?.ndf ?? 3
  for (const e of model.elements.values()) {
    if (!['ElasticBeamColumn', 'DispBeamColumn'].includes(e.eleType) || e.args.mass === undefined || e.args.mass === '') continue
    const mass = Number(e.args.mass)
    if (!Number.isFinite(mass) || mass < 0) throw new Error(`Element ${e.id}: mass per unit length must be finite and nonnegative.`)
    const a = model.nodes.get(e.nodes[0]), b = model.nodes.get(e.nodes[1])
    if (!a || !b) throw new Error(`Element ${e.id}: beam mass references missing nodes.`)
    const length = Math.hypot(...Array.from({ length: ndm }, (_, d) => (b.coords[d] ?? 0) - (a.coords[d] ?? 0)))
    const half = mass * length / 2
    for (const nodeId of e.nodes) {
      const original = masses.get(nodeId)?.values ?? []
      masses.set(nodeId, { nodeId, values: Array.from({ length: ndf }, (_, d) => (original[d] ?? 0) + (d < ndm ? half : 0)) })
    }
    const args = { ...e.args }
    delete args.mass; delete args['-mass']
    elements.set(e.id, { ...e, args })
  }
  return { ...model, elements, masses }
}
