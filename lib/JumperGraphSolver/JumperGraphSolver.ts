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

  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
  }) {
    super({
      ...input,
      greedyMultiplier: 1.2,
      rippingEnabled: true,
      ripCost: 100,
    })
    this.MAX_ITERATIONS = 100000
  }

  override estimateCostToEnd(port: JPort): number {
    return distance(port.d, this.currentEndRegion!.d.center)
  }
  override getPortUsagePenalty(port: JPort): number {
    return (port.ripCount ?? 0) * 2
  }
  override computeIncreasedRegionCostIfPortsAreUsed(
    region: JRegion,
    port1: JPort,
    port2: JPort,
  ): number {
    return computeDifferentNetCrossings(region, port1, port2) * 10
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
