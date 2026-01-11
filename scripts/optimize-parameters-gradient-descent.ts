import { generateJumperX4Grid } from "../lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createProblemFromBaseGraph } from "../lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import {
  JumperGraphSolver,
  JUMPER_GRAPH_SOLVER_DEFAULTS,
} from "../lib/JumperGraphSolver/JumperGraphSolver"

// Dataset sizes - frozen at start
const TRAIN_SAMPLES = 500
const VAL_SAMPLES = 200

const NUM_EPOCHS = 30
const INITIAL_LEARNING_RATE = 0.05 // Was 0.5 - reduced to prevent overshooting
const LR_DECAY = 0.98 // Slower decay to allow more exploration
const MOMENTUM = 0.5 // Was 0.9 - reduced to prevent oscillation
const MAX_GRADIENT = 1.0 // Clip gradients to prevent huge updates
const MIN_CROSSINGS = 5
const MAX_CROSSINGS = 26

// Track used seeds globally to never repeat
const usedSeeds = new Set<number>()
let seedCounter = 0

function getUniqueSeed(): number {
  while (usedSeeds.has(seedCounter)) {
    seedCounter++
  }
  usedSeeds.add(seedCounter)
  return seedCounter++
}

interface Parameters {
  portUsagePenalty: number
  portUsagePenaltySq: number
  crossingPenalty: number
  crossingPenaltySq: number
  ripCost: number
  greedyMultiplier: number
}

// Compute parameter-scaled epsilon
// For larger params, use larger epsilon to actually affect decisions
function getEpsilon(paramName: keyof Parameters, value: number): number {
  const baseEps = 0.02
  const scaledEps = 0.05 * Math.abs(value)
  return Math.max(baseEps, scaledEps)
}

const createBaseGraph = (
  orientation: "vertical" | "horizontal" = "vertical",
  rows: 1 | 2 = 1,
  cols: 1 | 2 = 1,
) =>
  generateJumperX4Grid({
    cols,
    rows,
    marginX: 1.2,
    marginY: 1.2,
    outerPaddingX: 2,
    outerPaddingY: 2,
    innerColChannelPointCount: 3,
    innerRowChannelPointCount: 3,
    outerChannelXPointCount: 3,
    outerChannelYPointCount: 3,
    regionsBetweenPads: true,
    orientation,
  })

// Generate sample configurations (crossing count + seed + grid size)
function generateSampleConfigs(
  count: number,
): { numCrossings: number; seed: number; rows: 1 | 2; cols: 1 | 2 }[] {
  const configs: {
    numCrossings: number
    seed: number
    rows: 1 | 2
    cols: 1 | 2
  }[] = []
  const allGridSizes: [1 | 2, 1 | 2][] = [
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
  ]
  // Grid sizes for >8 crossings (must have at least 2 rows or 2 cols)
  const largeGridSizes: [1 | 2, 1 | 2][] = [
    [1, 2],
    [2, 1],
    [2, 2],
  ]
  for (let i = 0; i < count; i++) {
    // Distribute crossings evenly across range
    const numCrossings =
      MIN_CROSSINGS + (i % (MAX_CROSSINGS - MIN_CROSSINGS + 1))
    // Use restricted grid sizes for >8 crossings
    const gridSizes = numCrossings > 8 ? largeGridSizes : allGridSizes
    // Cycle through grid sizes
    const [rows, cols] = gridSizes[i % gridSizes.length]
    configs.push({ numCrossings, seed: getUniqueSeed(), rows, cols })
  }
  return configs
}

interface EvaluationResult {
  // Continuous score: fraction of connections routed (0-1)
  // Even unsolved puzzles contribute partial credit
  continuousScore: number
  // Binary success rate for reference
  successRate: number
  // Total connections routed / total connections across all samples
  totalRouted: number
  totalConnections: number
}

// Evaluate parameters on a set of samples
// Returns continuous score (fraction routed) instead of binary solved/not-solved
function evaluateParameters(
  params: Parameters,
  samples: { numCrossings: number; seed: number; rows: 1 | 2; cols: 1 | 2 }[],
  progressLabel?: string,
): EvaluationResult {
  let totalRouted = 0
  let totalConnections = 0
  let solvedCount = 0

  for (let i = 0; i < samples.length; i++) {
    const { numCrossings, seed, rows, cols } = samples[i]
    if (progressLabel) {
      process.stdout.write(`\r${progressLabel}: ${i + 1}/${samples.length}`)
    }
    let bestRoutedFraction = 0
    let solved = false

    for (const orientation of ["vertical", "horizontal"] as const) {
      const graphWithConnections = createProblemFromBaseGraph({
        baseGraph: createBaseGraph(orientation, rows, cols),
        numCrossings,
        randomSeed: seed,
      })

      const totalConns = graphWithConnections.connections.length

      const solver = new JumperGraphSolver({
        inputGraph: {
          regions: graphWithConnections.regions,
          ports: graphWithConnections.ports,
        },
        inputConnections: graphWithConnections.connections,
        portUsagePenalty: params.portUsagePenalty,
        crossingPenalty: params.crossingPenalty,
        ripCost: params.ripCost,
      })

      // Apply additional parameters that aren't in constructor
      ;(solver as any).portUsagePenaltySq = params.portUsagePenaltySq
      ;(solver as any).crossingPenaltySq = params.crossingPenaltySq
      ;(solver as any).greedyMultiplier = params.greedyMultiplier

      solver.solve()

      // Compute fraction of connections routed (continuous metric)
      const routedFraction = solver.solvedRoutes.length / totalConns

      if (solver.solved) {
        solved = true
        bestRoutedFraction = 1.0
        break
      } else if (routedFraction > bestRoutedFraction) {
        bestRoutedFraction = routedFraction
      }
    }

    // For total tracking, use the best attempt's fraction
    // Estimate total connections from numCrossings (approx ceil((1+sqrt(1+8*n))/2))
    const estimatedConns = Math.ceil((1 + Math.sqrt(1 + 8 * numCrossings)) / 2)
    totalConnections += estimatedConns
    totalRouted += bestRoutedFraction * estimatedConns

    if (solved) {
      solvedCount++
    }
  }

  if (progressLabel) {
    process.stdout.write("\r" + " ".repeat(50) + "\r")
  }

  return {
    continuousScore: totalRouted / totalConnections,
    successRate: solvedCount / samples.length,
    totalRouted,
    totalConnections,
  }
}

// Compute gradient using central differences: (f(x+eps)-f(x-eps)) / (2*eps)
// This reduces noise compared to forward differences
function computeGradient(
  params: Parameters,
  samples: { numCrossings: number; seed: number; rows: 1 | 2; cols: 1 | 2 }[],
  epoch?: number,
): Parameters {
  const gradient: Parameters = {
    portUsagePenalty: 0,
    portUsagePenaltySq: 0,
    crossingPenalty: 0,
    crossingPenaltySq: 0,
    ripCost: 0,
    greedyMultiplier: 0,
  }

  const paramKeys: (keyof Parameters)[] = [
    "portUsagePenalty",
    "portUsagePenaltySq",
    "crossingPenalty",
    "crossingPenaltySq",
    "ripCost",
    "greedyMultiplier",
  ]

  for (const key of paramKeys) {
    const eps = getEpsilon(key, params[key])
    const prefix = epoch !== undefined ? `Epoch ${epoch} ` : ""

    // Forward evaluation: params + eps
    const forwardParams = { ...params }
    forwardParams[key] += eps
    const forwardResult = evaluateParameters(
      forwardParams,
      samples,
      `${prefix}Grad ${key}+`,
    )

    // Backward evaluation: params - eps
    const backwardParams = { ...params }
    backwardParams[key] = Math.max(0.001, backwardParams[key] - eps) // Keep positive
    const backwardResult = evaluateParameters(
      backwardParams,
      samples,
      `${prefix}Grad ${key}-`,
    )

    // Central difference
    const actualEps = forwardParams[key] - backwardParams[key]
    gradient[key] =
      (forwardResult.continuousScore - backwardResult.continuousScore) /
      actualEps
  }

  return gradient
}

// Apply gradient update
function updateParameters(
  params: Parameters,
  gradient: Parameters,
  lr: number,
): Parameters {
  const newParams: Parameters = {
    portUsagePenalty: params.portUsagePenalty + lr * gradient.portUsagePenalty,
    portUsagePenaltySq:
      params.portUsagePenaltySq + lr * gradient.portUsagePenaltySq,
    crossingPenalty: params.crossingPenalty + lr * gradient.crossingPenalty,
    crossingPenaltySq:
      params.crossingPenaltySq + lr * gradient.crossingPenaltySq,
    ripCost: params.ripCost + lr * gradient.ripCost,
    greedyMultiplier: params.greedyMultiplier + lr * gradient.greedyMultiplier,
  }
  return newParams
}

function formatParams(params: Parameters): string {
  return [
    `portUsagePenalty=${params.portUsagePenalty.toFixed(3)}`,
    // `portUsagePenaltySq=${params.portUsagePenaltySq.toFixed(3)}`,
    `crossingPenalty=${params.crossingPenalty.toFixed(3)}`,
    // `crossingPenaltySq=${params.crossingPenaltySq.toFixed(3)}`,
    `ripCost=${params.ripCost.toFixed(3)}`,
    `greedyMultiplier=${params.greedyMultiplier.toFixed(3)}`,
  ].join(", ")
}

function formatGradient(gradient: Parameters): string {
  return [
    `d_portUsagePenalty=${gradient.portUsagePenalty.toFixed(4)}`,
    // `d_portUsagePenaltySq=${gradient.portUsagePenaltySq.toFixed(4)}`,
    `d_crossingPenalty=${gradient.crossingPenalty.toFixed(4)}`,
    // `d_crossingPenaltySq=${gradient.crossingPenaltySq.toFixed(4)}`,
    `d_ripCost=${gradient.ripCost.toFixed(6)}`,
    `d_greedyMultiplier=${gradient.greedyMultiplier.toFixed(4)}`,
  ].join(", ")
}

async function main() {
  console.log("JumperGraphSolver Parameter Optimization via Gradient Descent")
  console.log("=".repeat(70))
  console.log(`Training samples: ${TRAIN_SAMPLES} (frozen)`)
  console.log(`Validation samples: ${VAL_SAMPLES} (frozen)`)
  console.log(`Number of epochs: ${NUM_EPOCHS}`)
  console.log(`Initial learning rate: ${INITIAL_LEARNING_RATE}`)
  console.log(`LR decay: ${LR_DECAY} per epoch`)
  console.log(`Momentum: ${MOMENTUM}`)
  console.log(
    "Using: central differences, parameter-scaled epsilon, continuous proxy",
  )
  console.log("=".repeat(70))
  console.log()

  // === FROZEN DATASETS ===
  // Generate train and val samples ONCE at the start
  console.log("Generating frozen datasets...")
  const trainSamples = generateSampleConfigs(TRAIN_SAMPLES)
  const valSamples = generateSampleConfigs(VAL_SAMPLES)
  console.log(
    `  Train: ${trainSamples.length} samples (seeds ${trainSamples[0].seed}-${trainSamples[trainSamples.length - 1].seed})`,
  )
  console.log(
    `  Val: ${valSamples.length} samples (seeds ${valSamples[0].seed}-${valSamples[valSamples.length - 1].seed})`,
  )
  console.log()

  // Initial parameters (from JumperGraphSolver defaults)
  let params: Parameters = { ...JUMPER_GRAPH_SOLVER_DEFAULTS }

  console.log("Initial parameters:")
  console.log(formatParams(params))
  console.log()

  // Evaluate initial performance
  console.log("Evaluating initial parameters...")
  const initialTrainResult = evaluateParameters(params, trainSamples, "Train")
  const initialValResult = evaluateParameters(params, valSamples, "Val")
  console.log(
    `  Train: ${(initialTrainResult.continuousScore * 100).toFixed(2)}% routed, ${(initialTrainResult.successRate * 100).toFixed(2)}% solved`,
  )
  console.log(
    `  Val:   ${(initialValResult.continuousScore * 100).toFixed(2)}% routed, ${(initialValResult.successRate * 100).toFixed(2)}% solved`,
  )
  console.log()

  let bestParams = { ...params }
  let bestValScore = initialValResult.continuousScore

  // Initialize velocity for momentum
  let velocity: Parameters = {
    portUsagePenalty: 0,
    portUsagePenaltySq: 0,
    crossingPenalty: 0,
    crossingPenaltySq: 0,
    ripCost: 0,
    greedyMultiplier: 0,
  }

  let learningRate = INITIAL_LEARNING_RATE

  const optimizationStartTime = performance.now()

  for (let epoch = 0; epoch < NUM_EPOCHS; epoch++) {
    const startTime = performance.now()

    // Compute gradient on training set using central differences
    const gradient = computeGradient(params, trainSamples, epoch + 1)

    // Update velocity with momentum
    const paramKeys: (keyof Parameters)[] = [
      "portUsagePenalty",
      "portUsagePenaltySq",
      "crossingPenalty",
      "crossingPenaltySq",
      "ripCost",
      "greedyMultiplier",
    ]
    for (const key of paramKeys) {
      // Clip gradients to prevent huge updates
      const clippedGrad = Math.max(
        -MAX_GRADIENT,
        Math.min(MAX_GRADIENT, gradient[key]),
      )
      velocity[key] = MOMENTUM * velocity[key] + clippedGrad
    }

    // Update parameters using velocity (momentum-based gradient)
    const prevParams = { ...params }
    params = updateParameters(params, velocity, learningRate)

    // Evaluate on both train and val (using continuous score)
    const trainResult = evaluateParameters(
      params,
      trainSamples,
      `Epoch ${epoch + 1} Train`,
    )
    const valResult = evaluateParameters(
      params,
      valSamples,
      `Epoch ${epoch + 1} Val`,
    )

    // Track best based on validation score
    if (valResult.continuousScore > bestValScore) {
      bestValScore = valResult.continuousScore
      bestParams = { ...params }
    }

    const duration = ((performance.now() - startTime) / 1000).toFixed(1)
    const totalElapsedMs = performance.now() - optimizationStartTime
    const totalElapsedSec = totalElapsedMs / 1000
    const avgSecondsPerEpoch = totalElapsedSec / (epoch + 1)
    const remainingEpochs = NUM_EPOCHS - (epoch + 1)
    const etaSeconds = avgSecondsPerEpoch * remainingEpochs

    const formatTime = (seconds: number): string => {
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = Math.floor(seconds % 60)
      if (h > 0) return `${h}h ${m}m ${s}s`
      if (m > 0) return `${m}m ${s}s`
      return `${s}s`
    }

    console.log(
      `Epoch ${(epoch + 1).toString().padStart(3)}/${NUM_EPOCHS} | ` +
        `Train: ${(trainResult.continuousScore * 100).toFixed(2)}% routed (${(trainResult.successRate * 100).toFixed(1)}% solved) | ` +
        `Val: ${(valResult.continuousScore * 100).toFixed(2)}% routed (${(valResult.successRate * 100).toFixed(1)}% solved) | ` +
        `LR: ${learningRate.toFixed(4)} | ` +
        `Time: ${duration}s`,
    )
    console.log(
      `  Total: ${formatTime(totalElapsedSec)} | ETA: ${formatTime(etaSeconds)}`,
    )
    console.log(`  Gradient: ${formatGradient(gradient)}`)

    // Show epsilon values used
    const epsilons = {
      portUsagePenalty: getEpsilon(
        "portUsagePenalty",
        prevParams.portUsagePenalty,
      ),
      crossingPenalty: getEpsilon(
        "crossingPenalty",
        prevParams.crossingPenalty,
      ),
      ripCost: getEpsilon("ripCost", prevParams.ripCost),
      greedyMultiplier: getEpsilon(
        "greedyMultiplier",
        prevParams.greedyMultiplier,
      ),
    }
    console.log(
      `  Epsilon: port=${epsilons.portUsagePenalty.toFixed(3)}, cross=${epsilons.crossingPenalty.toFixed(3)}, rip=${epsilons.ripCost.toFixed(3)}, greedy=${epsilons.greedyMultiplier.toFixed(3)}`,
    )
    console.log(`  Params:  ${formatParams(params)}`)
    console.log()

    // Decay learning rate
    learningRate *= LR_DECAY
  }

  console.log("=".repeat(70))
  console.log("Optimization Complete!")
  console.log("=".repeat(70))
  console.log()

  // Final evaluation on validation set
  const finalValResult = evaluateParameters(params, valSamples, "Final Val")
  const bestValResult = evaluateParameters(bestParams, valSamples, "Best Val")

  console.log("Final parameters (last epoch):")
  console.log(formatParams(params))
  console.log(
    `  Val: ${(finalValResult.continuousScore * 100).toFixed(2)}% routed, ${(finalValResult.successRate * 100).toFixed(2)}% solved`,
  )
  console.log()

  console.log("Best parameters (by validation score):")
  console.log(formatParams(bestParams))
  console.log(
    `  Val: ${(bestValResult.continuousScore * 100).toFixed(2)}% routed, ${(bestValResult.successRate * 100).toFixed(2)}% solved`,
  )
  console.log()

  console.log(`Total unique seeds used: ${usedSeeds.size}`)
}

main().catch(console.error)
