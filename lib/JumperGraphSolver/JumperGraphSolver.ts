import type { GraphicsObject } from "graphics-debug"
import { HyperGraphSolver } from "../HyperGraphSolver"
import type {
  Connection,
  HyperGraph,
  RegionPort,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"
import type { JPort, JRegion } from "./jumper-types"
import { visualizeJumperGraphSolver } from "./visualizeJumperGraphSolver"
import { distance } from "@tscircuit/math-utils"

export class JumperGraphSolver extends HyperGraphSolver<JRegion, JPort> {
  UNIT_OF_COST = "distance"

  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
  }) {
    super({ ...input, greedyMultiplier: 1.2, rippingEnabled: true, ripCost: 1 })
  }

  override estimateCostToEnd(port: JPort): number {
    return distance(port.d, this.currentEndRegion!.d.center)
  }
  override getPortUsagePenalty(port: JPort): number {
    return 0
  }
  override computeIncreasedRegionCostIfPortsAreUsed(
    region: JRegion,
    port1: JPort,
    port2: JPort,
  ): number {
    return 0
  }

  override routeSolvedHook(solvedRoute: SolvedRoute) {}

  override visualize(): GraphicsObject {
    return visualizeJumperGraphSolver(this)
  }
}
