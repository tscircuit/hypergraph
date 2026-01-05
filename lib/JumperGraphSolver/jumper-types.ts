import type { HyperGraph, Region, RegionPort } from "../types"
import type { Bounds } from "./Bounds"

export interface JRegion extends Region {
  d: {
    bounds: Bounds
    isPad: boolean
    isThroughJumper?: boolean
    isConnectionRegion?: boolean
  }
}
export interface JPort extends RegionPort {
  d: {
    x: number
    y: number
  }
}

export type JumperGraph = {
  regions: JRegion[]
  ports: JPort[]
}
