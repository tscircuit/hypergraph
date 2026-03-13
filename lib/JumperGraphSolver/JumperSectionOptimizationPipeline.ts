import {
  BasePipelineSolver,
  definePipelineStep,
  type PipelineStep,
} from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import {
  computeBoardCost,
  computeRegionCost,
} from "../HyperGraphSectionOptimizer/computeBoardCost"
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
import { convertSerializedConnectionsToConnections } from "lib/convertSerializedConnectionsToConnections"
import { convertSerializedHyperGraphToHyperGraph } from "lib/convertSerializedHyperGraphToHyperGraph"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertConnectionsToSerializedConnections } from "lib/convertConnectionsToSerializedConnections"

export type JumperSectionOptimizationPipelineInput = {
  inputGraph: HyperGraph | SerializedHyperGraph
  inputConnections: (Connection | SerializedConnection)[]
  expansionHopsFromCentralRegion: number
  maxAttemptsPerRegion?: number
  sectionMaxIterations?: number
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
    definePipelineStep(
      "jumperGraphSolver",
      JumperGraphSolver,
      (instance: JumperSectionOptimizationPipeline) => [
        {
          inputGraph: instance.normalizedGraph,
          inputConnections: instance.normalizedConnections,
        },
      ],
    ),
    definePipelineStep(
      "hyperGraphSectionOptimizer",
      HyperGraphSectionOptimizer,
      (instance: JumperSectionOptimizationPipeline) => [
        {
          inputGraph: instance.normalizedGraph,
          inputConnections: instance.normalizedConnections,
          inputSolvedRoutes:
            instance.getSolver<JumperGraphSolver>("jumperGraphSolver")!
              .solvedRoutes,
          sourceSolver:
            instance.getSolver<JumperGraphSolver>("jumperGraphSolver")!,
          expansionHopsFromCentralRegion:
            instance.inputProblem.expansionHopsFromCentralRegion,
          maxAttemptsPerRegion: instance.inputProblem.maxAttemptsPerRegion ?? 1,
          createHyperGraphSolver: (input) => new JumperGraphSolver(input),
          computeRegionCost,
          regionScore: computeRegionCost,
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
