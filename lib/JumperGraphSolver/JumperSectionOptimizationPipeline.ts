import {
  BasePipelineSolver,
  definePipelineStep,
  type PipelineStep,
} from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { convertConnectionsToSerializedConnections } from "lib/convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertSerializedConnectionsToConnections } from "lib/convertSerializedConnectionsToConnections"
import { convertSerializedHyperGraphToHyperGraph } from "lib/convertSerializedHyperGraphToHyperGraph"
import {
  computeJumperRegionCost,
} from "../HyperGraphSectionOptimizer/computeJumperGlobalCost"
import { HyperGraphSectionOptimizer } from "../HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type {
  Connection,
  HyperGraph,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"
import { JumperGraphSolver } from "./JumperGraphSolver"
import type { JumperGraph } from "./jumper-types"
import { visualizeJumperGraphWithSolvedRoutes } from "./visualizeJumperGraphSolver"

export type JumperSectionOptimizationPipelineInput = {
  inputGraph: HyperGraph | SerializedHyperGraph
  inputConnections: (Connection | SerializedConnection)[]
  expansionHopsFromCentralRegion: number
  maxAttemptsPerRegion?: number
  sectionMaxIterations?: number
  maxSectionAttempts?: number
  effort?: number
  ACCEPTABLE_COST: number
}

export class JumperSectionOptimizationPipeline extends BasePipelineSolver<JumperSectionOptimizationPipelineInput> {
  readonly normalizedGraph: SerializedHyperGraph
  readonly normalizedConnections: SerializedConnection[]

  constructor(input: JumperSectionOptimizationPipelineInput) {
    super(input)

    const hydratedGraph = convertSerializedHyperGraphToHyperGraph(
      input.inputGraph,
    )
    const hydratedConnections = convertSerializedConnectionsToConnections(
      input.inputConnections,
      hydratedGraph,
    )

    this.normalizedGraph =
      convertHyperGraphToSerializedHyperGraph(hydratedGraph)
    this.normalizedConnections =
      convertConnectionsToSerializedConnections(hydratedConnections)
  }

  pipelineDef: PipelineStep<any>[] = [
    definePipelineStep("jumperGraphSolver", JumperGraphSolver, (instance) => [
      {
        inputGraph: (instance as JumperSectionOptimizationPipeline)
          .normalizedGraph,
        inputConnections: (instance as JumperSectionOptimizationPipeline)
          .normalizedConnections,
      },
    ]),
    definePipelineStep(
      "hyperGraphSectionOptimizer",
      HyperGraphSectionOptimizer,
      (instance) => [
        {
          inputGraph: (instance as JumperSectionOptimizationPipeline)
            .normalizedGraph,
          inputConnections: (instance as JumperSectionOptimizationPipeline)
            .normalizedConnections,
          inputSolvedRoutes: (
            instance as JumperSectionOptimizationPipeline
          ).getSolver<JumperGraphSolver>("jumperGraphSolver")!.solvedRoutes,
          hyperGraphSolver: (
            instance as JumperSectionOptimizationPipeline
          ).getSolver<JumperGraphSolver>("jumperGraphSolver")!,
          expansionHopsFromCentralRegion: (
            instance as JumperSectionOptimizationPipeline
          ).inputProblem.expansionHopsFromCentralRegion,
          MAX_ATTEMPTS_PER_REGION:
            (instance as JumperSectionOptimizationPipeline).inputProblem
              .maxAttemptsPerRegion ?? 1,
          MAX_ATTEMPTS_PER_SECTION: (
            instance as JumperSectionOptimizationPipeline
          ).inputProblem.maxSectionAttempts,
          createHyperGraphSolver: (input) => new JumperGraphSolver(input),
          computeRegionCost: computeJumperRegionCost,
          regionCost: computeJumperRegionCost,
          effort:
            (instance as JumperSectionOptimizationPipeline).inputProblem
              .effort ?? 1,
          ACCEPTABLE_COST: (instance as JumperSectionOptimizationPipeline)
            .inputProblem.ACCEPTABLE_COST,
        },
      ],
    ),
  ]

  override _step() {
    super._step()

    const sectionSolver = this.getSolver<HyperGraphSectionOptimizer>(
      "hyperGraphSectionOptimizer",
    )
    if (sectionSolver) {
      sectionSolver.MAX_ITERATIONS =
        this.inputProblem.sectionMaxIterations ?? 200_000
    }
  }

  override initialVisualize(): GraphicsObject | null {
    const graph = convertSerializedHyperGraphToHyperGraph(this.normalizedGraph)
    const connections = convertSerializedConnectionsToConnections(
      this.normalizedConnections,
      graph,
    )
    return visualizeJumperGraphWithSolvedRoutes({
      graph: graph as JumperGraph,
      connections,
      solvedRoutes: [],
      title: "Initial Jumper Problem",
    })
  }

  override finalVisualize(): GraphicsObject | null {
    const initialSolver = this.getSolver<JumperGraphSolver>("jumperGraphSolver")
    if (!initialSolver) return null
    return visualizeJumperGraphWithSolvedRoutes({
      graph: {
        regions: initialSolver.graph.regions as JumperGraph["regions"],
        ports: initialSolver.graph.ports as JumperGraph["ports"],
      },
      connections: initialSolver.connections,
      solvedRoutes: initialSolver.solvedRoutes,
      title: "Final Jumper Solution",
    })
  }

  override visualize(): GraphicsObject {
    if (this.solved) {
      return this.finalVisualize() ?? super.visualize()
    }
    return super.visualize()
  }

  override getOutput(): SolvedRoute[] | null {
    const initialSolver = this.getSolver<JumperGraphSolver>("jumperGraphSolver")
    return initialSolver?.solvedRoutes ?? null
  }
}
