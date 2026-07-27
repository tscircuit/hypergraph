import type { Matrix } from "transformation-matrix"
import { applyToPoint, compose, rotate, translate } from "transformation-matrix"
import type { JumperGraph, JRegion, JPort } from "../jumper-types"
import { calculateGraphBounds } from "../jumper-graph-generator/calculateGraphBounds"
import { computeBoundsCenter } from "./getBoundsCenter"

/**
 * Applies a transformation matrix to all points in a graph.
 * Transforms region bounds, region centers, and port positions.
 */
export const applyTransformToGraph = (
  graph: JumperGraph,
  matrix: Matrix,
): JumperGraph => {
  const transformedRegions = graph.regions.map((region): JRegion => {
    const { bounds, center, ...rest } = region.d

    // Transform all four corners of the bounds
    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.minX, y: bounds.maxY },
      { x: bounds.maxX, y: bounds.maxY },
    ].map((corner) => applyToPoint(matrix, corner))

    // Calculate new bounds from transformed corners
    const newBounds = {
      minX: Math.min(...corners.map((c) => c.x)),
      maxX: Math.max(...corners.map((c) => c.x)),
      minY: Math.min(...corners.map((c) => c.y)),
      maxY: Math.max(...corners.map((c) => c.y)),
    }

    // Transform the center point
    const newCenter = applyToPoint(matrix, center)

    return {
      ...region,
      // Clear ports array - will be rebuilt with new port objects
      ports: [],
      d: {
        ...rest,
        bounds: newBounds,
        center: newCenter,
      },
    }
  })

  // Create a map from old region to new region
  const regionMap = new Map<JRegion, JRegion>()
  for (let i = 0; i < graph.regions.length; i++) {
    regionMap.set(graph.regions[i], transformedRegions[i])
  }

  // Transform ports
  const transformedPorts = graph.ports.map((port): JPort => {
    const newPosition = applyToPoint(matrix, port.d)
    const newRegion1 = regionMap.get(port.region1 as JRegion)!
    const newRegion2 = regionMap.get(port.region2 as JRegion)!

    const newPort: JPort = {
      ...port,
      region1: newRegion1,
      region2: newRegion2,
      d: newPosition,
    }

    // Add port references to the new regions
    newRegion1.ports.push(newPort)
    newRegion2.ports.push(newPort)

    return newPort
  })

  // Transform jumper locations if present
  const transformedJumperLocations = graph.jumperLocations?.map((loc) => {
    const newCenter = applyToPoint(matrix, loc.center)

    // Map pad regions to their transformed versions
    const newPadRegions = loc.padRegions.map(
      (region) => regionMap.get(region as JRegion)!,
    )

    // Determine new orientation after transformation
    // For a 90-degree rotation, horizontal becomes vertical and vice versa
    // We detect rotation by checking if the matrix causes a 90-degree rotation
    // by applying it to a unit vector
    const unitX = applyToPoint(matrix, { x: 1, y: 0 })
    const origin = applyToPoint(matrix, { x: 0, y: 0 })
    const dx = unitX.x - origin.x
    const dy = unitX.y - origin.y
    // If the transformed X axis is now primarily vertical, we've rotated 90 degrees
    const isRotated90 = Math.abs(dy) > Math.abs(dx)
    const newOrientation: "vertical" | "horizontal" = isRotated90
      ? loc.orientation === "horizontal"
        ? "vertical"
        : "horizontal"
      : loc.orientation

    return {
      center: newCenter,
      orientation: newOrientation,
      padRegions: newPadRegions,
    }
  })

  return {
    regions: transformedRegions,
    ports: transformedPorts,
    ...(graph.fixedOccupancy && {
      fixedOccupancy: {
        portReservations: structuredClone(
          graph.fixedOccupancy.portReservations ?? [],
        ),
        segments: (graph.fixedOccupancy.segments ?? []).map((segment) => ({
          ...structuredClone(segment),
          geometry: segment.geometry
            ? {
                start: applyToPoint(matrix, segment.geometry.start),
                end: applyToPoint(matrix, segment.geometry.end),
              }
            : undefined,
        })),
      },
    }),
    ...(transformedJumperLocations && {
      jumperLocations: transformedJumperLocations,
    }),
  }
}

/**
 * Rotates a graph 90 degrees clockwise around its center.
 */
export const rotateGraph90Degrees = (graph: JumperGraph): JumperGraph => {
  const bounds = calculateGraphBounds(graph.regions)
  const center = computeBoundsCenter(bounds)

  // Create a rotation matrix: translate to origin, rotate, translate back
  const matrix = compose(
    translate(center.x, center.y),
    rotate(-Math.PI / 2), // -90 degrees (clockwise)
    translate(-center.x, -center.y),
  )

  return applyTransformToGraph(graph, matrix)
}
