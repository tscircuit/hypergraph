import { HyperGraphSolver } from "lib/HyperGraphSolver"
import type { Connection, HyperGraph, Region, RegionPort } from "lib/types"

export class TestHyperGraphSolver extends HyperGraphSolver {
  override estimateCostToEnd(): number {
    return 0
  }

  override computeIncreasedRegionCostIfPortsAreUsed(): number {
    return 0
  }
}

export class DisallowBootstrapTransitionSolver extends TestHyperGraphSolver {
  override isTransitionAllowed(
    region: Region,
    port1: RegionPort,
    port2: RegionPort,
  ): boolean {
    return !(
      region.regionId === "B" &&
      port1.portId === "pAB" &&
      port2.portId === "pBC"
    )
  }
}

export class ExclusiveRegionBootstrapSolver extends TestHyperGraphSolver {
  override isRipRequiredForPortUsage(
    region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ): boolean {
    return Boolean(
      region.assignments?.some(
        (assignment) =>
          assignment.connection.mutuallyConnectedNetworkId !==
          this.currentConnection!.mutuallyConnectedNetworkId,
      ),
    )
  }
}

const createRegion = ({ regionId }: { regionId: string }): Region => ({
  regionId,
  ports: [],
  d: { regionId },
})

const connectRegions = ({
  portId,
  region1,
  region2,
}: {
  portId: string
  region1: Region
  region2: Region
}): RegionPort => {
  const port: RegionPort = {
    portId,
    region1,
    region2,
    d: { portId },
  }
  region1.ports.push(port)
  region2.ports.push(port)
  return port
}

const createConnection = ({
  connectionId,
  networkId,
  startRegion,
  endRegion,
}: {
  connectionId: string
  networkId: string
  startRegion: Region
  endRegion: Region
}): Connection => ({
  connectionId,
  mutuallyConnectedNetworkId: networkId,
  startRegion,
  endRegion,
})

export const createBootstrapGraph = () => {
  const regionA = createRegion({ regionId: "A" })
  const regionB = createRegion({ regionId: "B" })
  const regionC = createRegion({ regionId: "C" })
  const regionD = createRegion({ regionId: "D" })

  const portAB = connectRegions({
    portId: "pAB",
    region1: regionA,
    region2: regionB,
  })
  const portBC = connectRegions({
    portId: "pBC",
    region1: regionB,
    region2: regionC,
  })
  const portAD = connectRegions({
    portId: "pAD",
    region1: regionA,
    region2: regionD,
  })

  const connection1 = createConnection({
    connectionId: "c1",
    networkId: "n1",
    startRegion: regionA,
    endRegion: regionC,
  })
  const connection2 = createConnection({
    connectionId: "c2",
    networkId: "n2",
    startRegion: regionA,
    endRegion: regionD,
  })

  const graph: HyperGraph = {
    regions: [regionA, regionB, regionC, regionD],
    ports: [portAB, portBC, portAD],
    solvedRoutes: [
      {
        portPoints: [portAB, portBC],
        connection: connection1,
      },
    ],
  }

  return {
    graph,
    ports: { portAB, portBC, portAD },
    connections: { connection1, connection2 },
    regions: { regionA, regionB, regionC, regionD },
  }
}

export const createRippingGraph = () => {
  const regionA = createRegion({ regionId: "A" })
  const regionB = createRegion({ regionId: "B" })
  const regionC1 = createRegion({ regionId: "C1" })
  const regionC2 = createRegion({ regionId: "C2" })

  const portAB = connectRegions({
    portId: "pAB",
    region1: regionA,
    region2: regionB,
  })
  const portBC1 = connectRegions({
    portId: "pBC1",
    region1: regionB,
    region2: regionC1,
  })
  const portBC2 = connectRegions({
    portId: "pBC2",
    region1: regionB,
    region2: regionC2,
  })
  const portAC1 = connectRegions({
    portId: "pAC1",
    region1: regionA,
    region2: regionC1,
  })

  const connection1 = createConnection({
    connectionId: "c1",
    networkId: "n1",
    startRegion: regionA,
    endRegion: regionC1,
  })
  const connection2 = createConnection({
    connectionId: "c2",
    networkId: "n2",
    startRegion: regionA,
    endRegion: regionC2,
  })

  const graph: HyperGraph = {
    regions: [regionA, regionB, regionC1, regionC2],
    ports: [portAB, portBC1, portBC2, portAC1],
    solvedRoutes: [
      {
        portPoints: [portAB, portBC1],
        connection: connection1,
      },
    ],
  }

  return {
    graph,
    connections: { connection1, connection2 },
  }
}

export const createBootstrapConflictGraph = () => {
  const regionA = createRegion({ regionId: "A" })
  const regionB = createRegion({ regionId: "B" })
  const regionC = createRegion({ regionId: "C" })
  const regionD = createRegion({ regionId: "D" })
  const regionE = createRegion({ regionId: "E" })

  const portAB = connectRegions({
    portId: "pAB",
    region1: regionA,
    region2: regionB,
  })
  const portBC = connectRegions({
    portId: "pBC",
    region1: regionB,
    region2: regionC,
  })
  const portDB = connectRegions({
    portId: "pDB",
    region1: regionD,
    region2: regionB,
  })
  const portBE = connectRegions({
    portId: "pBE",
    region1: regionB,
    region2: regionE,
  })

  const connection1 = createConnection({
    connectionId: "c1",
    networkId: "n1",
    startRegion: regionA,
    endRegion: regionC,
  })
  const connection2 = createConnection({
    connectionId: "c2",
    networkId: "n2",
    startRegion: regionD,
    endRegion: regionE,
  })

  const graph: HyperGraph = {
    regions: [regionA, regionB, regionC, regionD, regionE],
    ports: [portAB, portBC, portDB, portBE],
    solvedRoutes: [
      {
        portPoints: [portAB, portBC],
        connection: connection1,
      },
      {
        portPoints: [portDB, portBE],
        connection: connection2,
      },
    ],
  }

  return {
    graph,
    connections: { connection1, connection2 },
  }
}

export const createSharedPortBootstrapGraph = () => {
  const regionA = createRegion({ regionId: "A" })
  const regionB = createRegion({ regionId: "B" })
  const regionC = createRegion({ regionId: "C" })
  const regionD = createRegion({ regionId: "D" })

  const portAB = connectRegions({
    portId: "pAB",
    region1: regionA,
    region2: regionB,
  })
  const portBC = connectRegions({
    portId: "pBC",
    region1: regionB,
    region2: regionC,
  })
  const portBD = connectRegions({
    portId: "pBD",
    region1: regionB,
    region2: regionD,
  })

  const connection1 = createConnection({
    connectionId: "c1",
    networkId: "n1",
    startRegion: regionA,
    endRegion: regionC,
  })
  const connection2 = createConnection({
    connectionId: "c2",
    networkId: "n1",
    startRegion: regionA,
    endRegion: regionD,
  })

  const graph: HyperGraph = {
    regions: [regionA, regionB, regionC, regionD],
    ports: [portAB, portBC, portBD],
    solvedRoutes: [
      {
        portPoints: [portAB, portBC],
        connection: connection1,
      },
      {
        portPoints: [portAB, portBD],
        connection: connection2,
      },
    ],
  }

  return {
    graph,
    connections: { connection1, connection2 },
  }
}
