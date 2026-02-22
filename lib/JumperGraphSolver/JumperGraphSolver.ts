import { distance } from "@tscircuit/math-utils"
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
import { computeCrossingAssignments } from "./computeCrossingAssignments"
import { computeDifferentNetCrossings } from "./computeDifferentNetCrossings"
import { countInputConnectionCrossings } from "./countInputConnectionCrossings"
import type { JPort, JRegion } from "./jumper-types"
import { visualizeJumperGraphSolver } from "./visualizeJumperGraphSolver"

export const JUMPER_GRAPH_SOLVER_DEFAULTS = {
  portUsagePenalty: 0.034685181009478865,
  // portUsagePenaltySq: 0.06194817180037216,
  portUsagePenaltySq: 0,
  crossingPenalty: 4.072520483177124,
  crossingPenaltySq: 0,
  // crossingPenaltySq: 0.1315528159128946,
  ripCost: 35.38577539020022,
  greedyMultiplier: 0.5518001238069296,
}

export class JumperGraphSolver extends HyperGraphSolver<JRegion, JPort> {
  override getSolverName(): string {
    return "JumperGraphSolver"
  }

  UNIT_OF_COST = "hops"

  portUsagePenalty = JUMPER_GRAPH_SOLVER_DEFAULTS.portUsagePenalty
  portUsagePenaltySq = JUMPER_GRAPH_SOLVER_DEFAULTS.portUsagePenaltySq
  crossingPenalty = JUMPER_GRAPH_SOLVER_DEFAULTS.crossingPenalty
  crossingPenaltySq = JUMPER_GRAPH_SOLVER_DEFAULTS.crossingPenaltySq
  override ripCost = JUMPER_GRAPH_SOLVER_DEFAULTS.ripCost
  baseMaxIterations = 4000
  additionalMaxIterationsPerConnection = 2000
  additionalMaxIterationsPerCrossing = 2000

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
      greedyMultiplier: JUMPER_GRAPH_SOLVER_DEFAULTS.greedyMultiplier,
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

    const crossings = countInputConnectionCrossings(
      this.graph,
      input.inputConnections,
    )

    this.MAX_ITERATIONS =
      this.baseMaxIterations +
      input.inputConnections.length *
        this.additionalMaxIterationsPerConnection +
      crossings * this.additionalMaxIterationsPerCrossing

    this.populateDistanceToEndMaps()
  }

  private populateDistanceToEndMaps() {
    // Get all unique end regions from connections
    const endRegions = new Set(this.connections.map((c) => c.endRegion))

    // For each end region, compute hop distances from all ports using BFS
    for (const endRegion of endRegions) {
      const regionDistanceMap = new Map<string, number>()
      const queue: Array<{ region: JRegion; distance: number }> = []

      regionDistanceMap.set(endRegion.regionId, 0)
      queue.push({ region: endRegion as JRegion, distance: 0 })

      while (queue.length > 0) {
        const { region, distance: dist } = queue.shift()!

        for (const port of region.ports) {
          const otherRegion = (
            port.region1 === region ? port.region2 : port.region1
          ) as JRegion
          if (!regionDistanceMap.has(otherRegion.regionId)) {
            regionDistanceMap.set(otherRegion.regionId, dist + 1)
            queue.push({ region: otherRegion, distance: dist + 1 })
          }
        }
      }

      // Populate each port's distanceToEndMap for this end region
      for (const port of this.graph.ports) {
        if (!port.distanceToEndMap) {
          port.distanceToEndMap = {}
        }
        const d1 = regionDistanceMap.get(port.region1.regionId) ?? Infinity
        const d2 = regionDistanceMap.get(port.region2.regionId) ?? Infinity
        port.distanceToEndMap[endRegion.regionId] = Math.min(d1, d2)
      }
    }
  }

  override estimateCostToEnd(port: JPort): number {
    const endRegionId = this.currentEndRegion!.regionId
    const hopDistance = port.distanceToEndMap![endRegionId]!
    return hopDistance
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
    const conflictingAssignments = crossingAssignments.filter(
      (a) =>
        a.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )

    if (!region.d.isThroughJumper) return conflictingAssignments

    for (const assignment of region.assignments ?? []) {
      if (
        assignment.connection.mutuallyConnectedNetworkId ===
        this.currentConnection!.mutuallyConnectedNetworkId
      ) {
        continue
      }
      conflictingAssignments.push(assignment)
    }

    return conflictingAssignments
  }

  override isRipRequiredForPortUsage(
    region: JRegion,
    _port1: JPort,
    _port2: JPort,
  ): boolean {
    if (!region.d.isThroughJumper) return false
    for (const assignment of region.assignments ?? []) {
      if (
        assignment.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId
      ) {
        return true
      }
    }
    return false
  }

  override routeSolvedHook(solvedRoute: SolvedRoute) {}

  override routeStartedHook(connection: Connection) {}

  override visualize(): GraphicsObject {
    return visualizeJumperGraphSolver(this)
  }
}
