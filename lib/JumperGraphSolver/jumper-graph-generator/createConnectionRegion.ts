import type { JRegion } from "../jumper-types"

export const CONNECTION_REGION_SIZE = 0.4

export const createConnectionRegion = (
  regionId: string,
  x: number,
  y: number,
): JRegion => {
  const halfSize = CONNECTION_REGION_SIZE / 2
  return {
    regionId,
    ports: [],
    d: {
      bounds: {
        minX: x - halfSize,
        maxX: x + halfSize,
        minY: y - halfSize,
        maxY: y + halfSize,
      },
      center: { x, y },
      isPad: false,
      isConnectionRegion: true,
    },
  }
}
