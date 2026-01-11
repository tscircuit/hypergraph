export type PortId = string
export type GraphEdgeId = string
export type RegionId = string
export type ConnectionId = string
export type NetworkId = string
export type GScore = number

export type RegionPort = {
  portId: PortId
  region1: Region
  region2: Region
  d: any
  assignment?: PortAssignment
  /**
   * The number of times this port has been ripped. Can be used to penalize
   * ports that are likely to block off connections
   */
  ripCount?: number

  /**
   * Optionally can be used by solvers to keep track of the distance to
   * each end era.
   */
  distanceToEndMap?: Record<RegionId, number>
}

export type Region = {
  regionId: RegionId
  ports: RegionPort[]
  d: any
  assignments?: RegionPortAssignment[]
}

export type PortAssignment = {
  solvedRoute: SolvedRoute
  connection: Connection
  // prevPort and nextPort if needed later
}

export type RegionPortAssignment = {
  regionPort1: RegionPort
  regionPort2: RegionPort
  region: Region
  connection: Connection
  solvedRoute: SolvedRoute
}

export type SolvedRoute = {
  path: Candidate[]
  connection: Connection
  requiredRip: boolean
}

export type Candidate<
  RegionType extends Region = Region,
  RegionPortType extends RegionPort = RegionPort,
> = {
  port: RegionPortType
  g: number
  h: number
  f: number
  hops: number
  parent?: Candidate
  lastPort?: RegionPortType
  lastRegion?: RegionType
  nextRegion?: RegionType
  ripRequired: boolean
}

export type HyperGraph = {
  ports: RegionPort[]
  regions: Region[]
}

export type SerializedGraphPort = {
  portId: PortId
  region1Id: RegionId
  region2Id: RegionId
  d: any
}
export type SerializedGraphRegion = {
  regionId: RegionId
  pointIds: PortId[]
  d: any
  assignments?: SerializedRegionPortAssignment[]
}
export type SerializedRegionPortAssignment = {
  regionPort1Id: PortId
  regionPort2Id: PortId
  connectionId: ConnectionId
}
export type SerializedHyperGraph = {
  ports: SerializedGraphPort[]
  regions: SerializedGraphRegion[]
}

export type Connection = {
  connectionId: ConnectionId
  mutuallyConnectedNetworkId: NetworkId
  startRegion: Region
  endRegion: Region
}

export type SerializedConnection = {
  connectionId: ConnectionId
  startRegionId: RegionId
  endRegionId: RegionId
}
