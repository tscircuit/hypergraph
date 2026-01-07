import type { Bounds } from "../Bounds"

export const computeBoundsCenter = (
  bounds: Bounds,
): { x: number; y: number } => {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }
}
