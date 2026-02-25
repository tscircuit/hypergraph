import type {
  JPort,
  JRegion,
  JumperGraph,
} from "../../lib/JumperGraphSolver/jumper-types"

export const translateJumperGraphByOffset = (
  graph: JumperGraph,
  dx: number,
  dy: number,
): JumperGraph => {
  const regionMap = new Map<JRegion, JRegion>()

  const regions = graph.regions.map((region): JRegion => {
    const translatedRegion: JRegion = {
      regionId: region.regionId,
      ports: [],
      d: {
        bounds: {
          minX: region.d.bounds.minX + dx,
          maxX: region.d.bounds.maxX + dx,
          minY: region.d.bounds.minY + dy,
          maxY: region.d.bounds.maxY + dy,
        },
        center: {
          x: region.d.center.x + dx,
          y: region.d.center.y + dy,
        },
        polygon: region.d.polygon?.map((point) => ({
          x: point.x + dx,
          y: point.y + dy,
        })),
        isPad: region.d.isPad,
        isThroughJumper: region.d.isThroughJumper,
        isConnectionRegion: region.d.isConnectionRegion,
        isViaRegion: region.d.isViaRegion,
      },
    }

    regionMap.set(region, translatedRegion)
    return translatedRegion
  })

  const ports = graph.ports.map((port): JPort => {
    const translatedPort: JPort = {
      portId: port.portId,
      region1: regionMap.get(port.region1 as JRegion)!,
      region2: regionMap.get(port.region2 as JRegion)!,
      d: {
        x: port.d.x + dx,
        y: port.d.y + dy,
      },
      region1T: port.region1T,
      region2T: port.region2T,
    }

    translatedPort.region1.ports.push(translatedPort)
    translatedPort.region2.ports.push(translatedPort)
    return translatedPort
  })

  return {
    regions,
    ports,
    jumperLocations: graph.jumperLocations?.map((location) => ({
      center: {
        x: location.center.x + dx,
        y: location.center.y + dy,
      },
      orientation: location.orientation,
      padRegions: location.padRegions
        .map((region) => regionMap.get(region))
        .filter((region): region is JRegion => Boolean(region)),
    })),
  }
}
