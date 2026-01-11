/**
 * Hyperparameter optimization using Simultaneous Perturbation Stochastic Approximation (SPSA)
 *
 * SPSA is an efficient gradient-free optimization method that only requires 2 function
 * evaluations per iteration, regardless of the number of parameters. This is much more
 * efficient than finite-difference methods which require 2p evaluations (where p = number
 * of parameters).
 *
 * Key features:
 * - Uses random perturbation vectors (Bernoulli ±1) to estimate gradients
 * - Gain sequences a_k and c_k that decay over iterations for convergence
 * - Pre-generates all problems and uses structuredClone for solver isolation
 *
 * Reference: Spall, J. C. (1992). "Multivariate Stochastic Approximation Using a
 * Simultaneous Perturbation Gradient Approximation"
 */

import { JUMPER_GRAPH_SOLVER_DEFAULTS } from "../../lib/JumperGraphSolver/JumperGraphSolver"
import {
  type Parameters,
  type SampleConfig,
  PARAM_KEYS,
  formatParams,
  formatTime,
  createZeroParams,
} from "./types"
import {
  generateSampleConfigs,
  pregenerateProblems,
  groupProblemsByConfig,
  getUsedSeedsCount,
  type PregeneratedProblem,
} from "./problem-generator"
import { evaluateParametersOnProblems } from "./evaluator"

// Dataset sizes
const TRAIN_SAMPLES = 1000
const VAL_SAMPLES = 200
const BATCH_SIZE = 200 // Number of training samples to use per iteration
const EPOCHS_PER_VALIDATION = 5

// SPSA hyperparameters
const NUM_ITERATIONS = 200

// Standard SPSA gain sequence parameters
// a_k = a / (k + A)^alpha - step size
// c_k = c / k^gamma - perturbation size
const SPSA_a = 0.1 // Initial step size multiplier
const SPSA_c = 0.25 // Initial perturbation size
const SPSA_A = 20 // Stability constant (typically ~10% of max iterations)
const SPSA_alpha = 0.602 // Standard value for asymptotic convergence
const SPSA_gamma = 0.101 // Standard value for asymptotic convergence

const MIN_CROSSINGS = 5
const MAX_CROSSINGS = 40

// Parameter scaling factors to handle different parameter magnitudes
// SPSA works best when all parameters are roughly the same scale
const PARAM_SCALES: Parameters = {
  portUsagePenalty: 1,
  // portUsagePenaltySq: 1,
  crossingPenalty: 10,
  // crossingPenaltySq: 1,
  ripCost: 50,
  greedyMultiplier: 1,
}

/**
 * Sample a random batch of configs from the full training set
 */
function sampleBatch(
  configs: SampleConfig[],
  batchSize: number,
): SampleConfig[] {
  if (batchSize >= configs.length) {
    return configs
  }
  const shuffled = [...configs]
  // Fisher-Yates shuffle (partial - only need first batchSize elements)
  for (let i = 0; i < batchSize; i++) {
    const j = i + Math.floor(Math.random() * (shuffled.length - i))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, batchSize)
}

/**
 * Generate a random Bernoulli perturbation vector (each element is ±1 with equal probability)
 */
function generatePerturbation(): Parameters {
  const delta = createZeroParams()
  for (const key of PARAM_KEYS) {
    delta[key] = Math.random() < 0.5 ? -1 : 1
  }
  return delta
}

/**
 * Compute gain sequences for iteration k (1-indexed)
 */
function getGains(k: number): { a_k: number; c_k: number } {
  const a_k = SPSA_a / Math.pow(k + SPSA_A, SPSA_alpha)
  const c_k = SPSA_c / Math.pow(k, SPSA_gamma)
  return { a_k, c_k }
}

/**
 * Apply perturbation to parameters: theta ± c_k * scale * delta
 */
function perturbParameters(
  params: Parameters,
  delta: Parameters,
  c_k: number,
  sign: 1 | -1,
): Parameters {
  const perturbed = { ...params }
  for (const key of PARAM_KEYS) {
    const perturbation = sign * c_k * PARAM_SCALES[key] * delta[key]
    perturbed[key] = Math.max(0.001, params[key] + perturbation) // Keep positive
  }
  return perturbed
}

/**
 * Estimate gradient using SPSA: g = (y+ - y-) / (2 * c_k * delta)
 * where delta^(-1) is element-wise inverse
 */
function estimateGradient(
  yPlus: number,
  yMinus: number,
  delta: Parameters,
  c_k: number,
): Parameters {
  const gradient = createZeroParams()
  const diff = yPlus - yMinus

  for (const key of PARAM_KEYS) {
    // g_i = (y+ - y-) / (2 * c_k * scale_i * delta_i)
    gradient[key] = diff / (2 * c_k * PARAM_SCALES[key] * delta[key])
  }

  return gradient
}

/**
 * Update parameters using gradient estimate: theta = theta + a_k * gradient
 */
function updateParameters(
  params: Parameters,
  gradient: Parameters,
  a_k: number,
): Parameters {
  const newParams = { ...params }
  for (const key of PARAM_KEYS) {
    // Scale the update by PARAM_SCALES for proper step sizes
    newParams[key] = Math.max(
      0.001,
      params[key] + a_k * PARAM_SCALES[key] * gradient[key],
    )
  }
  return newParams
}

function formatGradient(gradient: Parameters): string {
  return [
    `d_port=${gradient.portUsagePenalty.toFixed(4)}`,
    `d_cross=${gradient.crossingPenalty.toFixed(4)}`,
    `d_rip=${gradient.ripCost.toFixed(6)}`,
    `d_greedy=${gradient.greedyMultiplier.toFixed(4)}`,
  ].join(", ")
}

async function main() {
  console.log("JumperGraphSolver Parameter Optimization via SPSA")
  console.log("=".repeat(70))
  console.log(`Training samples: ${TRAIN_SAMPLES}`)
  console.log(`Validation samples: ${VAL_SAMPLES}`)
  console.log(`Batch size: ${BATCH_SIZE}`)
  console.log(`Number of iterations: ${NUM_ITERATIONS}`)
  console.log()
  console.log("SPSA hyperparameters:")
  console.log(`  a = ${SPSA_a}, c = ${SPSA_c}, A = ${SPSA_A}`)
  console.log(`  alpha = ${SPSA_alpha}, gamma = ${SPSA_gamma}`)
  console.log()
  console.log(
    "Using: SPSA gradient estimation, mini-batch sampling, pregenerated problems, structuredClone",
  )
  console.log("=".repeat(70))
  console.log()

  // === GENERATE SAMPLE CONFIGS ===
  console.log("Generating sample configurations...")
  const trainConfigs = generateSampleConfigs(
    TRAIN_SAMPLES,
    MIN_CROSSINGS,
    MAX_CROSSINGS,
  )
  const valConfigs = generateSampleConfigs(
    VAL_SAMPLES,
    MIN_CROSSINGS,
    MAX_CROSSINGS,
  )
  console.log(
    `  Train: ${trainConfigs.length} configs (seeds ${trainConfigs[0].seed}-${trainConfigs[trainConfigs.length - 1].seed})`,
  )
  console.log(
    `  Val: ${valConfigs.length} configs (seeds ${valConfigs[0].seed}-${valConfigs[valConfigs.length - 1].seed})`,
  )
  console.log()

  // === PREGENERATE ALL PROBLEMS ===
  console.log("Pregenerating all problems (this may take a while)...")
  const trainProblems = pregenerateProblems(trainConfigs, "  Train")
  const valProblems = pregenerateProblems(valConfigs, "  Val")
  console.log(
    `  Generated ${trainProblems.length} train problems, ${valProblems.length} val problems`,
  )
  console.log()

  // Group problems by config for efficient lookup
  const trainProblemsByConfig = groupProblemsByConfig(trainProblems)
  const valProblemsByConfig = groupProblemsByConfig(valProblems)

  // Initial parameters
  let params: Parameters = { ...JUMPER_GRAPH_SOLVER_DEFAULTS }

  console.log("Initial parameters:")
  console.log(formatParams(params))
  console.log()

  // Evaluate initial performance
  console.log("Evaluating initial parameters...")
  const initialTrainResult = evaluateParametersOnProblems(
    params,
    trainProblemsByConfig,
    trainConfigs,
    "Train",
  )
  const initialValResult = evaluateParametersOnProblems(
    params,
    valProblemsByConfig,
    valConfigs,
    "Val",
  )
  console.log(
    `  Train: ${(initialTrainResult.successRate * 100).toFixed(2)}% solved`,
  )
  console.log(
    `  Val:   ${(initialValResult.successRate * 100).toFixed(2)}% solved`,
  )
  console.log()

  let bestParams = { ...params }
  let bestValScore = initialValResult.successRate

  const optimizationStartTime = performance.now()

  for (let k = 1; k <= NUM_ITERATIONS; k++) {
    const iterStartTime = performance.now()

    // Get gain sequences for this iteration
    const { a_k, c_k } = getGains(k)

    // Sample a random batch for this iteration
    const batchConfigs = sampleBatch(trainConfigs, BATCH_SIZE)

    // Generate random perturbation vector
    const delta = generatePerturbation()

    // Evaluate at theta + c_k * delta
    const paramsPlus = perturbParameters(params, delta, c_k, 1)
    const resultPlus = evaluateParametersOnProblems(
      paramsPlus,
      trainProblemsByConfig,
      batchConfigs,
      `Iter ${k} +`,
    )

    // Evaluate at theta - c_k * delta
    const paramsMinus = perturbParameters(params, delta, c_k, -1)
    const resultMinus = evaluateParametersOnProblems(
      paramsMinus,
      trainProblemsByConfig,
      batchConfigs,
      `Iter ${k} -`,
    )

    // Estimate gradient using SPSA formula
    const gradient = estimateGradient(
      resultPlus.successRate,
      resultMinus.successRate,
      delta,
      c_k,
    )

    // Update parameters
    params = updateParameters(params, gradient, a_k)

    // Evaluate on validation set periodically to save time
    let valResult = { successRate: 0 }
    if (k % EPOCHS_PER_VALIDATION === 0 || k === NUM_ITERATIONS) {
      valResult = evaluateParametersOnProblems(
        params,
        valProblemsByConfig,
        valConfigs,
        `Iter ${k} Val`,
      )

      // Track best based on validation score
      if (valResult.successRate > bestValScore) {
        bestValScore = valResult.successRate
        bestParams = { ...params }
        console.log(`  *** New best! ***`)
      }
    }

    const iterDuration = (performance.now() - iterStartTime) / 1000
    const totalElapsedSec = (performance.now() - optimizationStartTime) / 1000
    const avgSecondsPerIter = totalElapsedSec / k
    const etaSeconds = avgSecondsPerIter * (NUM_ITERATIONS - k)

    // Use the better of the two perturbed success rates as a proxy for current performance
    const trainSuccessRate = Math.max(
      resultPlus.successRate,
      resultMinus.successRate,
    )

    console.log(
      `Iter ${k.toString().padStart(3)}/${NUM_ITERATIONS} | ` +
        `Train: ${(trainSuccessRate * 100).toFixed(2)}% | ` +
        (valResult.successRate > 0
          ? `Val: ${(valResult.successRate * 100).toFixed(2)}% | `
          : "") +
        `a_k=${a_k.toFixed(4)}, c_k=${c_k.toFixed(4)} | ` +
        `Time: ${iterDuration.toFixed(1)}s`,
    )
    console.log(
      `  Total: ${formatTime(totalElapsedSec)} | ETA: ${formatTime(etaSeconds)}`,
    )
    console.log(`  Gradient: ${formatGradient(gradient)}`)
    console.log(`  Params:   ${formatParams(params)}`)
    console.log()
  }

  console.log("=".repeat(70))
  console.log("Optimization Complete!")
  console.log("=".repeat(70))
  console.log()

  // Final evaluation
  const finalValResult = evaluateParametersOnProblems(
    params,
    valProblemsByConfig,
    valConfigs,
    "Final Val",
  )
  const bestValResult = evaluateParametersOnProblems(
    bestParams,
    valProblemsByConfig,
    valConfigs,
    "Best Val",
  )

  console.log("Final parameters (last iteration):")
  console.log(formatParams(params))
  console.log(`  Val: ${(finalValResult.successRate * 100).toFixed(2)}% solved`)
  console.log()

  console.log("Best parameters (by validation score):")
  console.log(formatParams(bestParams))
  console.log(`  Val: ${(bestValResult.successRate * 100).toFixed(2)}% solved`)
  console.log()

  console.log(`Total unique seeds used: ${getUsedSeedsCount()}`)

  // Output as JSON for easy copy-paste
  console.log()
  console.log("Best parameters as JSON:")
  console.log(JSON.stringify(bestParams, null, 2))
}

main().catch(console.error)
