import type { GraphicsObject } from "graphics-debug"
import { HyperGraphSolver } from "../HyperGraphSolver"
import type {
  Connection,
  HyperGraph,
  RegionPortAssignment,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"
import type { JPort, JRegion } from "./jumper-types"
import { visualizeJumperGraphSolver } from "./visualizeJumperGraphSolver"
import { distance } from "@tscircuit/math-utils"
import { computeDifferentNetCrossings } from "./computeDifferentNetCrossings"
import { computeCrossingAssignments } from "./computeCrossingAssignments"

export class JumperGraphSolver extends HyperGraphSolver<JRegion, JPort> {
  UNIT_OF_COST = "distance"

  portUsagePenalty = 1
  portUsagePenaltySq = 0
  crossingPenalty = 6
  crossingPenaltySq = 0
  override ripCost = 40
  baseMaxIterations = 400
  additionalMaxIterationsPerConnection = 200

  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
    ripCost?: number
    portUsagePenalty?: number
    crossingPenalty?: number
    baseMaxIterations?: number
    additionalMaxIterationsPerConnection?: number
  }) {
    super({
      greedyMultiplier: 1.2,
      rippingEnabled: true,
      ...input,
    })
    this.ripCost = input.ripCost ?? this.ripCost
    this.portUsagePenalty = input.portUsagePenalty ?? this.portUsagePenalty
    this.crossingPenalty = input.crossingPenalty ?? this.crossingPenalty
    this.baseMaxIterations = input.baseMaxIterations ?? this.baseMaxIterations
    this.additionalMaxIterationsPerConnection =
      input.additionalMaxIterationsPerConnection ??
      this.additionalMaxIterationsPerConnection

    this.MAX_ITERATIONS =
      this.baseMaxIterations +
      input.inputConnections.length * this.additionalMaxIterationsPerConnection
  }

  override estimateCostToEnd(port: JPort): number {
    return distance(port.d, this.currentEndRegion!.d.center)
  }
  override getPortUsagePenalty(port: JPort): number {
    const ripCount = port.ripCount ?? 0
    return ripCount * this.portUsagePenalty + ripCount * this.portUsagePenaltySq
  }
  override computeIncreasedRegionCostIfPortsAreUsed(
    region: JRegion,
    port1: JPort,
    port2: JPort,
  ): number {
    const crossings = computeDifferentNetCrossings(region, port1, port2)
    return crossings * this.crossingPenalty + crossings * this.crossingPenaltySq
  }

  override getRipsRequiredForPortUsage(
    region: JRegion,
    port1: JPort,
    port2: JPort,
  ): RegionPortAssignment[] {
    const crossingAssignments = computeCrossingAssignments(region, port1, port2)
    // Filter out same-network crossings since those don't require ripping
    return crossingAssignments.filter(
      (a) =>
        a.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )
  }

  override routeSolvedHook(solvedRoute: SolvedRoute) {}

  override visualize(): GraphicsObject {
    return visualizeJumperGraphSolver(this)
  }
}
