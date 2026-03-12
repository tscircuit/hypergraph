import type { SerializedHyperGraph } from "lib/index"
/**
 * Adds bounding box data to regions in the graph based on their exact geometry, allowing for accurate rendering and hit-testing even when explicit bounds are not provided. This is useful for visualizing solved routes in test fixtures where the input graph may only include center points and dimensions for regions without pre-calculated bounds.
 */
export const addRegionBoundsFromExactGeometry = (
  graph: SerializedHyperGraph,
): SerializedHyperGraph => ({
  ...graph,
  regions: graph.regions.map((region) => {
    const d = region.d as {
      center?: { x: number; y: number }
      width?: number
      height?: number
      bounds?: {
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
    }

    if (d?.bounds || !d?.center || !d.width || !d.height) return region

    return {
      ...region,
      d: {
        ...d,
        bounds: {
          minX: d.center.x - d.width / 2,
          maxX: d.center.x + d.width / 2,
          minY: d.center.y - d.height / 2,
          maxY: d.center.y + d.height / 2,
        },
        isPad: false,
        isConnectionRegion: false,
      },
    }
  }),
})
