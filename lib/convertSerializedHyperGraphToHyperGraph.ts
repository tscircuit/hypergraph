import type {
  HyperGraph,
  PortId,
  Region,
  RegionId,
  RegionPort,
  SerializedHyperGraph,
} from "./types"
import { cloneFixedOccupancy } from "./fixedOccupancy"

export const convertSerializedHyperGraphToHyperGraph = (
  inputGraph: SerializedHyperGraph | HyperGraph,
): HyperGraph => {
  // If already a HyperGraph (has ports with region references), return as-is
  if (
    inputGraph.ports.length > 0 &&
    "region1" in inputGraph.ports[0] &&
    typeof inputGraph.ports[0].region1 === "object"
  ) {
    return inputGraph as HyperGraph
  }

  // Convert serialized format to HyperGraph
  const portMap = new Map<PortId, RegionPort>()
  const regionMap = new Map<RegionId, Region>()

  // First pass: create regions without ports
  for (const region of inputGraph.regions) {
    const { assignments: _, ...regionWithoutAssignments } = region as any
    regionMap.set(region.regionId, {
      ...regionWithoutAssignments,
      d: regionWithoutAssignments.d
        ? structuredClone(regionWithoutAssignments.d)
        : regionWithoutAssignments.d,
      ports: [],
      assignments: undefined,
    })
  }

  // Second pass: create ports with region references
  for (const port of inputGraph.ports as any[]) {
    const region1 = regionMap.get(port.region1Id ?? port.region1?.regionId)!
    const region2 = regionMap.get(port.region2Id ?? port.region2?.regionId)!

    const deserializedPort: RegionPort = {
      portId: port.portId,
      region1,
      region2,
      d: port.d,
    }

    portMap.set(port.portId, deserializedPort)
    region1.ports.push(deserializedPort)
    region2.ports.push(deserializedPort)
  }

  return {
    ports: Array.from(portMap.values()),
    regions: Array.from(regionMap.values()),
    ...(inputGraph.fixedOccupancy && {
      fixedOccupancy: cloneFixedOccupancy(inputGraph.fixedOccupancy),
    }),
  }
}
