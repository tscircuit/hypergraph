import type { Bounds } from "../JumperGraphSolver/Bounds"
import type {
  JPort,
  JRegion,
  JumperGraph,
} from "../JumperGraphSolver/jumper-types"

export type { Bounds, JRegion, JPort, JumperGraph }

export type RegionRef = { id: string }

export type PortSpread =
  | { kind: "midpoint" }
  | { kind: "even"; inset?: "half" | number }
  | { kind: "fractions"; ts: number[] }

export type ConnectOpts = {
  idPrefix?: string
  tolerance?: number
}

export type ValidateOpts = {
  tolerance?: number
  allowNonBoundaryPorts?: boolean
}

export type BuildOpts = {
  validate?: boolean
  tolerance?: number
}

export type SharedBoundary = {
  axis: "vertical" | "horizontal"
  position: number // x for vertical, y for horizontal
  min: number // min along the shared axis
  max: number // max along the shared axis
}

export type RegionData = {
  id: string
  bounds: Bounds | null
  polygon: { x: number; y: number }[] | null
  center: { x: number; y: number } | null
  width: number | null
  height: number | null
  anchor: "center" | "min"
  isPad: boolean
  isThroughJumper: boolean
  isConnectionRegion: boolean
  meta: Record<string, unknown>
}

export type PortData = {
  id: string
  region1Id: string
  region2Id: string
  x: number
  y: number
}

export class TopologyError extends Error {
  constructor(
    message: string,
    public details?: {
      regionIds?: string[]
      relationship?: string
      suggestion?: string
    },
  ) {
    super(message)
    this.name = "TopologyError"
  }
}
