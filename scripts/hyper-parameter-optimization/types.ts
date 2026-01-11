export interface Parameters {
  portUsagePenalty: number
  // portUsagePenaltySq: number
  crossingPenalty: number
  // crossingPenaltySq: number
  ripCost: number
  greedyMultiplier: number
}

export const PARAM_KEYS: (keyof Parameters)[] = [
  "portUsagePenalty",
  // "portUsagePenaltySq",
  "crossingPenalty",
  // "crossingPenaltySq",
  "ripCost",
  "greedyMultiplier",
]

export interface SampleConfig {
  numCrossings: number
  seed: number
  rows: 1 | 2 | 3
  cols: 1 | 2 | 3
}

export interface EvaluationResult {
  continuousScore: number
  successRate: number
  totalRouted: number
  totalConnections: number
}

export function formatParams(params: Parameters): string {
  return [
    `portUsagePenalty=${params.portUsagePenalty.toFixed(3)}`,
    // `portUsagePenaltySq=${params.portUsagePenaltySq.toFixed(3)}`,
    `crossingPenalty=${params.crossingPenalty.toFixed(3)}`,
    // `crossingPenaltySq=${params.crossingPenaltySq.toFixed(3)}`,
    `ripCost=${params.ripCost.toFixed(3)}`,
    `greedyMultiplier=${params.greedyMultiplier.toFixed(3)}`,
  ].join(", ")
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function createZeroParams(): Parameters {
  return {
    portUsagePenalty: 0,
    // portUsagePenaltySq: 0,
    crossingPenalty: 0,
    // crossingPenaltySq: 0,
    ripCost: 0,
    greedyMultiplier: 0,
  }
}
