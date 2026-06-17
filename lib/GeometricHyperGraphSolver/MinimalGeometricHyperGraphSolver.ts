import type { GraphicsObject } from "graphics-debug"
import { HyperGraphSolver } from "../HyperGraphSolver"
import { visualizeJumperGraphSolver } from "../JumperGraphSolver/visualizeJumperGraphSolver"
import type {
  Connection,
  HyperGraph,
  RegionPortAssignment,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"
import { computeGeometricCrossingAssignments } from "./computeGeometricCrossingAssignments"
import type {
  GeometricHyperGraph,
  GeometricPort,
  GeometricRegion,
} from "./geometric-types"

export const MINIMAL_GEOMETRIC_SOLVER_DEFAULTS = {
  distanceWeight: 1,
  intersectionPenalty: 1_000,
  greedyMultiplier: 0.6,
  ripCost: 1_000,
  baseMaxIterations: 4_000,
  additionalMaxIterationsPerConnection: 2_000,
}

export class MinimalGeometricHyperGraphSolver extends HyperGraphSolver<
  GeometricRegion,
  GeometricPort
> {
  override getSolverName(): string {
    return "MinimalGeometricHyperGraphSolver"
  }

  distanceWeight = MINIMAL_GEOMETRIC_SOLVER_DEFAULTS.distanceWeight
  intersectionPenalty = MINIMAL_GEOMETRIC_SOLVER_DEFAULTS.intersectionPenalty
  override ripCost = MINIMAL_GEOMETRIC_SOLVER_DEFAULTS.ripCost
  baseMaxIterations = MINIMAL_GEOMETRIC_SOLVER_DEFAULTS.baseMaxIterations
  additionalMaxIterationsPerConnection =
    MINIMAL_GEOMETRIC_SOLVER_DEFAULTS.additionalMaxIterationsPerConnection

  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
    inputSolvedRoutes?: SolvedRoute[]
    distanceWeight?: number
    intersectionPenalty?: number
    greedyMultiplier?: number
    ripCost?: number
    baseMaxIterations?: number
    additionalMaxIterationsPerConnection?: number
  }) {
    super({
      greedyMultiplier:
        input.greedyMultiplier ??
        MINIMAL_GEOMETRIC_SOLVER_DEFAULTS.greedyMultiplier,
      rippingEnabled: true,
      ...input,
    })

    this.distanceWeight = input.distanceWeight ?? this.distanceWeight
    this.intersectionPenalty =
      input.intersectionPenalty ?? this.intersectionPenalty
    this.ripCost = input.ripCost ?? this.ripCost
    this.baseMaxIterations = input.baseMaxIterations ?? this.baseMaxIterations
    this.additionalMaxIterationsPerConnection =
      input.additionalMaxIterationsPerConnection ??
      this.additionalMaxIterationsPerConnection

    this.MAX_ITERATIONS =
      this.baseMaxIterations +
      input.inputConnections.length * this.additionalMaxIterationsPerConnection
  }

  override estimateCostToEnd(port: GeometricPort): number {
    const endCenter = this.currentEndRegion!.d.center
    return (
      Math.hypot(port.d.x - endCenter.x, port.d.y - endCenter.y) *
      this.distanceWeight
    )
  }

  override computeIncreasedRegionCostIfPortsAreUsed(
    region: GeometricRegion,
    port1: GeometricPort,
    port2: GeometricPort,
  ): number {
    const segmentDistance =
      Math.hypot(port1.d.x - port2.d.x, port1.d.y - port2.d.y) *
      this.distanceWeight
    const intersectionCount = computeGeometricCrossingAssignments(
      region,
      port1,
      port2,
    ).filter(
      (assignment) =>
        assignment.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    ).length

    return segmentDistance + intersectionCount * this.intersectionPenalty
  }

  override getRipsRequiredForPortUsage(
    region: GeometricRegion,
    port1: GeometricPort,
    port2: GeometricPort,
  ): RegionPortAssignment[] {
    return computeGeometricCrossingAssignments(region, port1, port2).filter(
      (assignment) =>
        assignment.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )
  }

  override isRipRequiredForPortUsage(
    region: GeometricRegion,
    port1: GeometricPort,
    port2: GeometricPort,
  ): boolean {
    return this.getRipsRequiredForPortUsage(region, port1, port2).length > 0
  }

  override visualize(): GraphicsObject {
    return visualizeJumperGraphSolver(this as any)
  }
}
