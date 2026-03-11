import type {
  Connection,
  HyperGraph,
  PortId,
  Region,
  RegionId,
  RegionPort,
  RegionPortAssignment,
  SerializedHyperGraph,
} from "./types"

const isHydratedHyperGraph = (
  inputGraph: SerializedHyperGraph | HyperGraph,
): inputGraph is HyperGraph => {
  return (
    inputGraph.ports.length > 0 &&
    "region1" in inputGraph.ports[0] &&
    typeof inputGraph.ports[0].region1 === "object"
  )
}

export const convertSerializedHyperGraphToHyperGraph = (
  inputGraph: SerializedHyperGraph | HyperGraph,
): HyperGraph => {
  // If already a HyperGraph (has ports with region references), return as-is
  if (isHydratedHyperGraph(inputGraph)) {
    return inputGraph
  }

  // Convert serialized format to HyperGraph
  const portMap = new Map<PortId, RegionPort>()
  const regionMap = new Map<RegionId, Region>()

  // First pass: create regions without ports
  for (const region of inputGraph.regions) {
    const { assignments: _, ...regionWithoutAssignments } = region
    regionMap.set(region.regionId, {
      ...regionWithoutAssignments,
      ports: [],
      assignments: undefined,
    })
  }

  // Second pass: create ports with region references
  for (const port of inputGraph.ports) {
    const region1 = regionMap.get(port.region1Id)!
    const region2 = regionMap.get(port.region2Id)!

    const hydratedPort: RegionPort = {
      portId: port.portId,
      region1,
      region2,
      d: port.d,
    }

    portMap.set(port.portId, hydratedPort)
    region1.ports.push(hydratedPort)
    region2.ports.push(hydratedPort)
  }

  // Third pass: hydrate fixed region assignments
  for (const region of inputGraph.regions) {
    const hydratedRegion = regionMap.get(region.regionId)!
    const serializedAssignments = region.assignments ?? []
    hydratedRegion.assignments = []

    for (const assignment of serializedAssignments) {
      const regionPort1 = portMap.get(assignment.regionPort1Id)
      const regionPort2 = portMap.get(assignment.regionPort2Id)
      if (!regionPort1 || !regionPort2) continue

      const fixedConnection: Connection = {
        connectionId: assignment.connectionId,
        mutuallyConnectedNetworkId: assignment.connectionId,
        startRegion: hydratedRegion,
        endRegion: hydratedRegion,
      }

      const hydratedAssignment: RegionPortAssignment = {
        regionPort1,
        regionPort2,
        region: hydratedRegion,
        connection: fixedConnection,
        isFixed: true,
      }

      hydratedRegion.assignments.push(hydratedAssignment)
      regionPort1.fixedAssignments ??= []
      regionPort1.fixedAssignments.push(hydratedAssignment)
      regionPort2.fixedAssignments ??= []
      regionPort2.fixedAssignments.push(hydratedAssignment)
    }
  }

  return {
    ports: Array.from(portMap.values()),
    regions: Array.from(regionMap.values()),
  }
}
