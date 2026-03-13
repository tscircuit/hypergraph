import type { Region, RegionPort } from "lib/types"

/** Provides or builds a synthetic boundary region for ports crossing the section edge. */
export const getOrCreateBoundaryRegion = ({
  port,
  boundaryRegionMap,
}: {
  port: RegionPort
  boundaryRegionMap: Map<string, Region>
}): Region => {
  let boundaryRegion = boundaryRegionMap.get(port.portId)
  if (!boundaryRegion) {
    const x = typeof port.d?.x === "number" ? port.d.x : 0
    const y = typeof port.d?.y === "number" ? port.d.y : 0
    boundaryRegion = {
      regionId: `__section_boundary__${port.portId}`,
      ports: [],
      d: {
        isBoundaryRegion: true,
        boundaryPortId: port.portId,
        isPad: false,
        isThroughJumper: false,
        isConnectionRegion: true,
        center: { x, y },
        bounds: {
          minX: x - 0.05,
          maxX: x + 0.05,
          minY: y - 0.05,
          maxY: y + 0.05,
        },
      },
      assignments: [],
    }
    boundaryRegionMap.set(port.portId, boundaryRegion)
  }
  return boundaryRegion
}
