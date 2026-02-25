import type {
  RegionRef,
  ConnectOpts,
  ValidateOpts,
  BuildOpts,
  PortData,
  Bounds,
  JRegion,
  JPort,
  JumperGraph,
} from "./types"
import { TopologyError } from "./types"
import { RegionBuilder } from "./RegionBuilder"
import { ConnectBuilder } from "./ConnectBuilder"
import { PortBuilder } from "./PortBuilder"
import {
  computeBoundsFromRegionData,
  computeCenterFromBounds,
  validateBounds,
  pointOnBoundary,
  findSharedBoundary,
} from "./utils"

export class Topology {
  private regions: Map<string, RegionBuilder> = new Map()
  private ports: PortData[] = []
  private portIds: Set<string> = new Set()
  private pendingConnections: ConnectBuilder[] = []
  private scopePrefix: string = ""
  private defaultTolerance: number = 0.001

  private prefixId(id: string): string {
    return this.scopePrefix ? `${this.scopePrefix}:${id}` : id
  }

  private generateRegionId(): string {
    let counter = 0
    while (true) {
      const id = this.prefixId(`region_${counter}`)
      if (!this.regions.has(id)) {
        return id
      }
      counter++
    }
  }

  private generatePortId(): string {
    let counter = 0
    while (true) {
      const id = this.prefixId(`port_${counter}`)
      if (!this.portIds.has(id)) {
        return id
      }
      counter++
    }
  }

  region(id?: string): RegionBuilder {
    const fullId = id ? this.prefixId(id) : this.generateRegionId()

    if (this.regions.has(fullId)) {
      throw new TopologyError(`Region "${fullId}" already exists`, {
        regionIds: [fullId],
        suggestion: "Use a unique region ID or omit to auto-generate",
      })
    }

    const builder = new RegionBuilder(fullId)
    this.regions.set(fullId, builder)
    return builder
  }

  getRegion(id: string): RegionRef {
    const fullId = this.prefixId(id)
    const region = this.regions.get(fullId)
    if (!region) {
      throw new TopologyError(`Region "${fullId}" not found`, {
        regionIds: [fullId],
        suggestion: "Create the region first with .region(id)",
      })
    }
    return region.ref()
  }

  private resolveRegion(ref: RegionRef | string): {
    id: string
    bounds: Bounds
  } {
    const id = typeof ref === "string" ? this.prefixId(ref) : ref.id
    const region = this.regions.get(id)
    if (!region) {
      throw new TopologyError(`Region "${id}" not found`, {
        regionIds: [id],
        suggestion: "Create the region first with .region(id)",
      })
    }
    const data = region.getData()
    const bounds = computeBoundsFromRegionData(data)
    return { id, bounds }
  }

  private addPort(port: PortData): void {
    if (this.portIds.has(port.id)) {
      throw new TopologyError(`Port "${port.id}" already exists`, {
        suggestion: "Use a unique port ID",
      })
    }
    this.portIds.add(port.id)
    this.ports.push(port)
  }

  connect(
    a: RegionRef | string,
    b: RegionRef | string,
    opts?: ConnectOpts,
  ): ConnectBuilder {
    const region1 = this.resolveRegion(a)
    const region2 = this.resolveRegion(b)

    // Capture current scope prefix for the builder
    const currentScopePrefix = this.scopePrefix

    const builder = new ConnectBuilder(
      region1.id,
      region2.id,
      region1.bounds,
      region2.bounds,
      (port) => this.addPort(port),
      (id) => (currentScopePrefix ? `${currentScopePrefix}:${id}` : id),
      {
        idPrefix: opts?.idPrefix,
        tolerance: opts?.tolerance ?? this.defaultTolerance,
      },
    )

    // Track this connection so we can finalize it with default ports if needed
    this.pendingConnections.push(builder)

    return builder
  }

  port(id?: string): PortBuilder {
    const fullId = id ? this.prefixId(id) : this.generatePortId()
    return new PortBuilder(
      fullId,
      (ref) => this.resolveRegion(ref),
      (port) => this.addPort(port),
      this.defaultTolerance,
    )
  }

  scope(prefix: string, fn: (t: Topology) => void): void {
    const previousPrefix = this.scopePrefix
    this.scopePrefix = previousPrefix ? `${previousPrefix}:${prefix}` : prefix

    try {
      fn(this)
    } finally {
      this.scopePrefix = previousPrefix
    }
  }

  validate(opts?: ValidateOpts): void {
    const tolerance = opts?.tolerance ?? this.defaultTolerance
    const allowNonBoundaryPorts = opts?.allowNonBoundaryPorts ?? true

    const errors: string[] = []

    // Validate all regions
    for (const [id, builder] of this.regions) {
      const data = builder.getData()

      try {
        const bounds = computeBoundsFromRegionData(data)
        validateBounds(bounds, id)
      } catch (e) {
        if (e instanceof TopologyError) {
          errors.push(e.message)
        } else {
          throw e
        }
      }
    }

    // Validate all ports
    for (const port of this.ports) {
      // Check region references exist
      if (!this.regions.has(port.region1Id)) {
        errors.push(
          `Port "${port.id}" references non-existent region "${port.region1Id}"`,
        )
      }
      if (!this.regions.has(port.region2Id)) {
        errors.push(
          `Port "${port.id}" references non-existent region "${port.region2Id}"`,
        )
      }

      // If both regions exist, check port position validity
      if (
        this.regions.has(port.region1Id) &&
        this.regions.has(port.region2Id)
      ) {
        const region1 = this.resolveRegion(port.region1Id)
        const region2 = this.resolveRegion(port.region2Id)

        const onBoundary1 = pointOnBoundary(
          { x: port.x, y: port.y },
          region1.bounds,
          tolerance,
        )
        const onBoundary2 = pointOnBoundary(
          { x: port.x, y: port.y },
          region2.bounds,
          tolerance,
        )

        if (!allowNonBoundaryPorts && !onBoundary1 && !onBoundary2) {
          errors.push(
            `Port "${port.id}" at (${port.x}, ${port.y}) is not on the boundary of either region "${port.region1Id}" or "${port.region2Id}"`,
          )
        }

        // Check if regions share a boundary (optional warning)
        try {
          findSharedBoundary(
            region1.bounds,
            region2.bounds,
            port.region1Id,
            port.region2Id,
            tolerance,
          )
        } catch {
          // Regions don't share a boundary - this is allowed but could be flagged
        }
      }
    }

    if (errors.length > 0) {
      throw new TopologyError(
        `Topology validation failed with ${errors.length} error(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`,
      )
    }
  }

  toJumperGraph(opts?: BuildOpts): JumperGraph {
    // Finalize any pending connections with default ports
    for (const connection of this.pendingConnections) {
      connection.finalizeIfNeeded()
    }
    this.pendingConnections = []

    if (opts?.validate !== false) {
      this.validate({ tolerance: opts?.tolerance })
    }

    // Step 1: Create all JRegion objects
    const jregions: Map<string, JRegion> = new Map()
    const regionsList: JRegion[] = []

    for (const [id, builder] of this.regions) {
      const data = builder.getData()
      const bounds = computeBoundsFromRegionData(data)
      const center = computeCenterFromBounds(bounds)

      const jregion: JRegion = {
        regionId: id,
        ports: [],
        d: {
          bounds,
          center,
          isPad: data.isPad,
          ...(data.polygon && { polygon: data.polygon }),
          ...(data.isThroughJumper && { isThroughJumper: true }),
          ...(data.isConnectionRegion && { isConnectionRegion: true }),
          ...data.meta,
        },
      }

      jregions.set(id, jregion)
      regionsList.push(jregion)
    }

    // Step 2: Create all JPort objects and link to regions
    const portsList: JPort[] = []

    for (const portData of this.ports) {
      const region1 = jregions.get(portData.region1Id)
      const region2 = jregions.get(portData.region2Id)

      if (!region1 || !region2) {
        throw new TopologyError(
          `Port "${portData.id}" references non-existent region`,
          {
            regionIds: [portData.region1Id, portData.region2Id],
          },
        )
      }

      const jport: JPort = {
        portId: portData.id,
        region1,
        region2,
        d: {
          x: portData.x,
          y: portData.y,
        },
      }

      // Push port into both regions' port arrays
      region1.ports.push(jport)
      region2.ports.push(jport)

      portsList.push(jport)
    }

    return {
      regions: regionsList,
      ports: portsList,
    }
  }

  // Utility method to merge an existing JumperGraph
  merge(
    graph: JumperGraph,
    opts?: {
      prefix?: string
      transform?: (p: { x: number; y: number }) => { x: number; y: number }
    },
  ): void {
    const prefix = opts?.prefix ?? ""
    const transform = opts?.transform ?? ((p) => p)

    // Map old region IDs to new region IDs
    const regionIdMap: Map<string, string> = new Map()

    // Import regions
    for (const region of graph.regions) {
      const newId = prefix ? `${prefix}:${region.regionId}` : region.regionId

      if (this.regions.has(newId)) {
        throw new TopologyError(
          `Region "${newId}" already exists during merge`,
          {
            regionIds: [newId],
          },
        )
      }

      regionIdMap.set(region.regionId, newId)

      const builder = new RegionBuilder(newId)
      const transformedBounds = {
        minX: Math.min(
          transform({ x: region.d.bounds.minX, y: region.d.bounds.minY }).x,
          transform({ x: region.d.bounds.maxX, y: region.d.bounds.maxY }).x,
        ),
        maxX: Math.max(
          transform({ x: region.d.bounds.minX, y: region.d.bounds.minY }).x,
          transform({ x: region.d.bounds.maxX, y: region.d.bounds.maxY }).x,
        ),
        minY: Math.min(
          transform({ x: region.d.bounds.minX, y: region.d.bounds.minY }).y,
          transform({ x: region.d.bounds.maxX, y: region.d.bounds.maxY }).y,
        ),
        maxY: Math.max(
          transform({ x: region.d.bounds.minX, y: region.d.bounds.minY }).y,
          transform({ x: region.d.bounds.maxX, y: region.d.bounds.maxY }).y,
        ),
      }

      builder.rect(transformedBounds)

      if (region.d.isPad) builder.pad()
      if (region.d.isThroughJumper) builder.throughJumper()
      if (region.d.isConnectionRegion) builder.connectionRegion()

      // Copy any extra metadata
      const {
        bounds,
        center,
        isPad,
        isThroughJumper,
        isConnectionRegion,
        ...rest
      } = region.d
      if (Object.keys(rest).length > 0) {
        builder.meta(rest)
      }

      this.regions.set(newId, builder)
    }

    // Import ports
    for (const port of graph.ports) {
      const newId = prefix ? `${prefix}:${port.portId}` : port.portId

      if (this.portIds.has(newId)) {
        throw new TopologyError(`Port "${newId}" already exists during merge`, {
          suggestion: "Use a different prefix",
        })
      }

      const newRegion1Id = regionIdMap.get(port.region1.regionId)
      const newRegion2Id = regionIdMap.get(port.region2.regionId)

      if (!newRegion1Id || !newRegion2Id) {
        throw new TopologyError(
          `Port "${port.portId}" references region not in the merged graph`,
        )
      }

      const transformedPos = transform({ x: port.d.x, y: port.d.y })

      this.portIds.add(newId)
      this.ports.push({
        id: newId,
        region1Id: newRegion1Id,
        region2Id: newRegion2Id,
        x: transformedPos.x,
        y: transformedPos.y,
      })
    }
  }

  // Get all region IDs (useful for debugging)
  getRegionIds(): string[] {
    return Array.from(this.regions.keys())
  }

  // Get all port IDs (useful for debugging)
  getPortIds(): string[] {
    return Array.from(this.portIds)
  }
}
