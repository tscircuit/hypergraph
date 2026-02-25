import viaTile from "assets/ViaGraphSolver/via-tile.json"
import type { ViaTile } from "./ViaGraphSolver"
import { generateViaTopologyGrid } from "./via-graph-generator/generateViaTopologyGrid"
import { generateViaTopologyRegions } from "./via-graph-generator/generateViaTopologyRegions"

export { viaTile }

export function generateDefaultViaTopologyRegions(
  opts: Parameters<typeof generateViaTopologyRegions>[1],
) {
  return generateViaTopologyRegions(viaTile as ViaTile, opts)
}

export function generateDefaultViaTopologyGrid(
  opts: Omit<Parameters<typeof generateViaTopologyGrid>[0], "viaTile">,
) {
  return generateViaTopologyGrid({
    ...opts,
    viaTile: viaTile as ViaTile,
  })
}
