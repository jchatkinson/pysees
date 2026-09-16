export type ProtocolType = 'monotonic' | 'cyclic' | 'custom'
export type CyclicStrainIncrement = 'evenly_per_cycle' | 'none'

export interface LoadingProtocolInputs {
  type: ProtocolType
  maxStrain: number
  approxSteps: number
  numberOfCycles: number
  strainIncrement: CyclicStrainIncrement
  customText: string
}

function linspace(start: number, end: number, count: number) {
  if (count <= 1) return [start]
  const step = (end - start) / (count - 1)
  const values: number[] = []
  for (let i = 0; i < count; i += 1) values.push(start + step * i)
  return values
}

function parseCustomProtocol(text: string) {
  const values = text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,\s]+/))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value))
  if (values.length >= 2) return values
  if (values.length === 1) return [values[0], values[0]]
  return [0, 0.001, -0.001, 0.002, -0.002, 0]
}

function generateMonotonicProtocol(maxStrain: number, approxSteps: number) {
  const peak = Number.isFinite(maxStrain) && maxStrain !== 0 ? maxStrain : 0.02
  const steps = Math.max(2, Math.round(approxSteps) || 200)
  return linspace(0, peak, steps + 1)
}

function generateCyclicProtocol(maxStrain: number, numberOfCycles: number, approxSteps: number, strainIncrement: CyclicStrainIncrement) {
  const peak = Math.abs(maxStrain) || 0.02
  const cycles = Math.max(1, Math.round(numberOfCycles) || 3)
  const totalSteps = Math.max(10, Math.round(approxSteps) || 200)
  const pointsPerHalf = Math.max(2, Math.floor(totalSteps / (4 * cycles)))
  const protocol: number[] = []

  for (let i = 1; i <= cycles; i += 1) {
    const cyclePeak = strainIncrement === 'none' ? peak : (peak * i) / cycles
    const up = linspace(0, cyclePeak, pointsPerHalf)
    const back = linspace(cyclePeak, 0, pointsPerHalf).slice(1)
    const down = linspace(0, -cyclePeak, pointsPerHalf).slice(1)
    const recover = linspace(-cyclePeak, 0, pointsPerHalf).slice(1)
    const cycleValues = [...up, ...back, ...down, ...recover]
    if (protocol.length > 0 && cycleValues.length > 0 && Math.abs(protocol[protocol.length - 1] - cycleValues[0]) < 1e-12) cycleValues.shift()
    protocol.push(...cycleValues)
  }
  if (protocol.length >= 2) return protocol
  return [0, peak, 0, -peak, 0]
}

export function generateLoadingProtocol(inputs: LoadingProtocolInputs) {
  if (inputs.type === 'custom') return parseCustomProtocol(inputs.customText)
  if (inputs.type === 'monotonic') return generateMonotonicProtocol(inputs.maxStrain, inputs.approxSteps)
  return generateCyclicProtocol(inputs.maxStrain, inputs.numberOfCycles, inputs.approxSteps, inputs.strainIncrement)
}
