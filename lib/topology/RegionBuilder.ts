import type { Bounds, RegionRef, RegionData } from "./types"
import { TopologyError } from "./types"

export class RegionBuilder implements RegionRef {
  private data: RegionData

  constructor(id: string) {
    this.data = {
      id,
      bounds: null,
      polygon: null,
      center: null,
      width: null,
      height: null,
      anchor: "center",
      isPad: false,
      isThroughJumper: false,
      isConnectionRegion: false,
      meta: {},
    }
  }

  get id(): string {
    return this.data.id
  }

  // Geometry methods

  rect(b: Bounds): this {
    this.data.bounds = { ...b }
    this.data.polygon = null
    // Clear center/size if rect is used
    this.data.center = null
    this.data.width = null
    this.data.height = null
    return this
  }

  polygon(points: { x: number; y: number }[]): this {
    if (points.length < 3) {
      throw new TopologyError(
        `Region "${this.data.id}" has invalid polygon: at least 3 points required`,
        {
          regionIds: [this.data.id],
          suggestion: "Provide at least three polygon vertices",
        },
      )
    }

    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new TopologyError(
          `Region "${this.data.id}" has invalid polygon point`,
          {
            regionIds: [this.data.id],
            suggestion: "Use finite numeric x/y values",
          },
        )
      }
    }

    this.data.polygon = points.map((p) => ({ x: p.x, y: p.y }))
    this.data.bounds = null
    this.data.center = null
    this.data.width = null
    this.data.height = null
    return this
  }

  center(x: number, y: number): this {
    this.data.center = { x, y }
    // Clear bounds if center/size approach is used
    this.data.bounds = null
    this.data.polygon = null
    return this
  }

  size(w: number, h: number, anchor: "center" | "min" = "center"): this {
    if (w <= 0 || h <= 0) {
      throw new TopologyError(
        `Region "${this.data.id}" has invalid size: width (${w}) and height (${h}) must be positive`,
        {
          regionIds: [this.data.id],
          suggestion: "Use positive values for width and height",
        },
      )
    }
    this.data.width = w
    this.data.height = h
    this.data.anchor = anchor
    // Clear bounds if center/size approach is used
    this.data.bounds = null
    this.data.polygon = null
    return this
  }

  // Semantic methods

  pad(isPad: boolean = true): this {
    this.data.isPad = isPad
    return this
  }

  throughJumper(isTJ: boolean = true): this {
    this.data.isThroughJumper = isTJ
    return this
  }

  connectionRegion(isConn: boolean = true): this {
    this.data.isConnectionRegion = isConn
    return this
  }

  meta(extra: Record<string, unknown>): this {
    this.data.meta = { ...this.data.meta, ...extra }
    return this
  }

  // Get the internal data (used by Topology)
  getData(): RegionData {
    return this.data
  }

  // Get a reference to this region
  ref(): RegionRef {
    return { id: this.data.id }
  }
}
