import { HyperGraphSolver } from "./HyperGraphSolver"
import type { Region, RegionPort } from "./types"

export interface JRegion extends Region {}
export interface JPort extends RegionPort {}

export class JumperGraphSolver extends HyperGraphSolver<JRegion, JPort> {
  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
  }) {
    super(input)
  }

  override estimateCostToEnd(port: RegionPort): number {}
}
