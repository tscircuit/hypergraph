import { BaseSolver } from "@tscircuit/solver-utils"
import { convertConnectionsToSerializedConnections } from "./convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "./convertHyperGraphToSerializedHyperGraph"
import { convertSerializedConnectionsToConnections } from "./convertSerializedConnectionsToConnections"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
import { PriorityQueue } from "./PriorityQueue"
import type {
  Candidate,
  Connection,
  GScore,
  HyperGraph,
  InputSolvedRoute,
  PortId,
  Region,
  RegionId,
  RegionPort,
  RegionPortAssignment,
  SerializedConnection,
  SerializedHyperGraph,
  SerializedInputSolvedRoute,
  SolvedRoute,
} from "./types"

export class HyperGraphSolver<
  RegionType extends Region = Region,
  RegionPortType extends RegionPort = RegionPort,
  CandidateType extends Candidate<RegionType, RegionPortType> = Candidate<
    RegionType,
    RegionPortType
  >,
> extends BaseSolver {
  override getSolverName(): string {
    return "HyperGraphSolver"
  }

  graph: HyperGraph
  connections: Connection[]

  candidateQueue: PriorityQueue<Candidate>
  unprocessedConnections: Connection[]

  solvedRoutes: SolvedRoute[] = []

  currentConnection: Connection | null = null
  currentEndRegion: Region | null = null

  greedyMultiplier = 1.0
  rippingEnabled = false
  ripCost = 0

  lastCandidate: Candidate | null = null

  visitedPointsForCurrentConnection: Map<PortId, GScore> = new Map()

  constructor(
    public input: {
      inputGraph: HyperGraph | SerializedHyperGraph
      inputConnections: (Connection | SerializedConnection)[]
      greedyMultiplier?: number
      rippingEnabled?: boolean
      ripCost?: number
    },
  ) {
    super()
    this.graph = convertSerializedHyperGraphToHyperGraph(input.inputGraph)
    for (const region of this.graph.regions) {
      region.assignments = []
    }
    this.connections = convertSerializedConnectionsToConnections(
      input.inputConnections,
      this.graph,
    )
    if (input.greedyMultiplier !== undefined)
      this.greedyMultiplier = input.greedyMultiplier
    if (input.rippingEnabled !== undefined)
      this.rippingEnabled = input.rippingEnabled
    if (input.ripCost !== undefined) this.ripCost = input.ripCost
    this.unprocessedConnections = [...this.connections]
    this.candidateQueue = new PriorityQueue<Candidate>()
    this.bootstrapSolvedRoutes({ inputGraph: input.inputGraph })
    if (this.unprocessedConnections.length === 0) {
      this.solved = true
      return
    }
    this.beginNewConnection()
  }

  override getConstructorParams() {
    const graphForSerialization: HyperGraph = {
      ...this.graph,
      solvedRoutes: this.solvedRoutes.map((solvedRoute) => ({
        portPoints: solvedRoute.path.map((candidate) => candidate.port),
        connection: solvedRoute.connection,
      })),
    }

    return {
      inputGraph: convertHyperGraphToSerializedHyperGraph(graphForSerialization),
      inputConnections: convertConnectionsToSerializedConnections(
        this.connections,
      ),
      greedyMultiplier: this.greedyMultiplier,
      rippingEnabled: this.rippingEnabled,
      ripCost: this.ripCost,
    }
  }

  computeH(candidate: CandidateType): number {
    return this.estimateCostToEnd(candidate.port)
  }

  /**
   * OVERRIDE THIS
   *
   * Return the estimated remaining cost to the end of the route. You must
   * first understand the UNIT of your costs. If it's distance, then this could
   * be something like distance(port, this.currentEndRegion.d.center)
   */
  estimateCostToEnd(port: RegionPortType): number {
    return 0
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * This is a penalty for using a port that is not relative to a connection,
   * e.g. maybe this port is in a special area of congestion. Use this to
   * penalize ports that are e.g. likely to block off connections, you may want
   * to use port.ripCount to help determine this penalty, or you can use port
   * position, region volume etc.
   */
  getPortUsagePenalty(port: RegionPortType): number {
    return 0
  }

  /**
   * OVERRIDE THIS
   *
   * Return the cost of using two ports in the region, make sure to consider
   * existing assignments. You may use this to penalize intersections
   */
  computeIncreasedRegionCostIfPortsAreUsed(
    region: RegionType,
    port1: RegionPortType,
    port2: RegionPortType,
  ): number {
    return 0
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * Return the assignments that would need to be ripped if the given ports
   * are used together in the region. This is used to determine if adopting
   * a route would require ripping other routes due to problematic crossings.
   */
  getRipsRequiredForPortUsage(
    _region: RegionType,
    _port1: RegionPortType,
    _port2: RegionPortType,
  ): RegionPortAssignment[] {
    return []
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * Return true if using the candidate transition should incur ripCost even
   * when there is no direct port-assignment conflict.
   */
  isRipRequiredForPortUsage(
    _region: RegionType,
    _port1: RegionPortType,
    _port2: RegionPortType,
  ): boolean {
    return false
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * Return false to prevent transitioning through a region from `_port1` to
   * `_port2`.
   */
  isTransitionAllowed(
    _region: RegionType,
    _port1: RegionPortType,
    _port2: RegionPortType,
  ): boolean {
    return true
  }

  computeG(candidate: CandidateType): number {
    return (
      candidate.parent!.g +
      this.computeIncreasedRegionCostIfPortsAreUsed(
        candidate.lastRegion!,
        candidate.lastPort!,
        candidate.port,
      ) +
      (candidate.ripRequired ? this.ripCost : 0) +
      this.getPortUsagePenalty(candidate.port)
    )
  }

  /**
   * Return a subset of the candidates for entering a region. These candidates
   * are all possible ways to enter the region- you can e.g. return the middle
   * port to make it so that you're not queueing candidates that are likely
   * redundant.
   */
  selectCandidatesForEnteringRegion(candidates: Candidate[]): Candidate[] {
    return candidates
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * Compute the full set of solved routes that must be ripped to accept
   * `newlySolvedRoute`. By default this returns all conflicting routes
   * (always-rip behavior)
   *
   * Override this to implement partial ripping, where only a subset of
   * conflicting routes are removed.
   */
  computeRoutesToRip(newlySolvedRoute: SolvedRoute): Set<SolvedRoute> {
    const crossingRoutesToRip = this.computeCrossingRoutes(newlySolvedRoute)
    const portReuseRoutesToRip = this.computePortOverlapRoutes(newlySolvedRoute)
    return new Set<SolvedRoute>([
      ...crossingRoutesToRip,
      ...portReuseRoutesToRip,
    ])
  }

  /**
   * Returns solved routes that overlap ports with the newly solved route.
   * Use this in computeRoutesToRip overrides to include port reuse rips.
   */
  computePortOverlapRoutes(newlySolvedRoute: SolvedRoute): Set<SolvedRoute> {
    const portReuseRoutesToRip: Set<SolvedRoute> = new Set()
    for (const candidate of newlySolvedRoute.path) {
      if (
        candidate.port.assignment &&
        candidate.port.assignment.connection.mutuallyConnectedNetworkId !==
          newlySolvedRoute.connection.mutuallyConnectedNetworkId
      ) {
        portReuseRoutesToRip.add(candidate.port.assignment.solvedRoute)
      }
    }
    return portReuseRoutesToRip
  }

  computeCrossingRoutes(newlySolvedRoute: SolvedRoute): Set<SolvedRoute> {
    const crossingRoutesToRip: Set<SolvedRoute> = new Set()
    for (const candidate of newlySolvedRoute.path) {
      if (!candidate.lastPort || !candidate.lastRegion) continue
      const ripsRequired = this.getRipsRequiredForPortUsage(
        candidate.lastRegion as RegionType,
        candidate.lastPort as RegionPortType,
        candidate.port as RegionPortType,
      )
      for (const assignment of ripsRequired) {
        crossingRoutesToRip.add(assignment.solvedRoute)
      }
    }
    return crossingRoutesToRip
  }

  private commitSolvedRoute(
    solvedRoute: SolvedRoute,
    { callHook = true }: { callHook?: boolean } = {},
  ) {
    const existingSolvedRoute = this.solvedRoutes.find(
      (route) =>
        route.connection.connectionId === solvedRoute.connection.connectionId,
    )
    if (existingSolvedRoute) {
      throw new Error(
        `Connection ${solvedRoute.connection.connectionId} already has a solved route`,
      )
    }

    for (const candidate of solvedRoute.path) {
      if (
        candidate.port.assignment &&
        candidate.port.assignment.connection.mutuallyConnectedNetworkId !==
          solvedRoute.connection.mutuallyConnectedNetworkId
      ) {
        throw new Error(
          `Port ${candidate.port.portId} is already assigned to connection ${candidate.port.assignment.connection.connectionId}`,
        )
      }
      candidate.port.assignment = {
        solvedRoute,
        connection: solvedRoute.connection,
      }
      if (!candidate.lastPort) continue
      const regionPortAssignment: RegionPortAssignment = {
        regionPort1: candidate.lastPort,
        regionPort2: candidate.port,
        region: candidate.lastRegion!,
        connection: solvedRoute.connection,
        solvedRoute,
      }
      candidate.lastRegion!.assignments?.push(regionPortAssignment)
    }

    this.solvedRoutes.push(solvedRoute)
    if (callHook) this.routeSolvedHook(solvedRoute)
  }

  private isSerializedInputSolvedRoute(
    solvedRoute: InputSolvedRoute | SerializedInputSolvedRoute,
  ): solvedRoute is SerializedInputSolvedRoute {
    return "connectionId" in solvedRoute
  }

  private getBootstrapSolvedRoutes({
    inputGraph,
  }: {
    inputGraph: HyperGraph | SerializedHyperGraph
  }): Array<InputSolvedRoute | SerializedInputSolvedRoute> {
    const rawSolvedRoutes: Array<InputSolvedRoute | SerializedInputSolvedRoute> =
      []
    for (const solvedRoute of inputGraph.solvedRoutes ?? []) {
      rawSolvedRoutes.push(solvedRoute)
    }
    return rawSolvedRoutes
  }

  private createBootstrappedRoute({
    rawSolvedRoute,
    portMap,
    connectionMap,
  }: {
    rawSolvedRoute: InputSolvedRoute | SerializedInputSolvedRoute
    portMap: Map<PortId, RegionPort>
    connectionMap: Map<string, Connection>
  }): SolvedRoute {
    const connectionId =
      this.isSerializedInputSolvedRoute(rawSolvedRoute)
        ? rawSolvedRoute.connectionId
        : rawSolvedRoute.connection.connectionId
    const connection = connectionMap.get(connectionId)
    if (!connection) {
      throw new Error(`Unknown solved route connection: ${connectionId}`)
    }

    const pathPortIds =
      this.isSerializedInputSolvedRoute(rawSolvedRoute)
        ? rawSolvedRoute.pathPortIds
        : rawSolvedRoute.portPoints.map((port) => port.portId)

    if (pathPortIds.length === 0) {
      throw new Error(`Solved route ${connectionId} must include at least one port`)
    }

    const pathPorts = pathPortIds.map((portId) => {
      const port = portMap.get(portId)
      if (!port) {
        throw new Error(
          `Solved route ${connectionId} references unknown port ${portId}`,
        )
      }
      return port
    })

    const previousConnection = this.currentConnection
    const previousEndRegion = this.currentEndRegion
    this.currentConnection = connection
    this.currentEndRegion = connection.endRegion

    let currentRegion = connection.startRegion
    let previousCandidate: Candidate | undefined
    const path: Candidate[] = []

    try {
      for (const [index, port] of pathPorts.entries()) {
        const entersFromCurrentRegion =
          port.region1 === currentRegion || port.region2 === currentRegion
        if (!entersFromCurrentRegion) {
          throw new Error(
            `Solved route ${connectionId} has invalid transition at port ${port.portId}`,
          )
        }
        const nextRegion =
          port.region1 === currentRegion ? port.region2 : port.region1
        const candidate: Candidate = {
          port,
          g: index,
          h: 0,
          f: index,
          hops: index,
          parent: previousCandidate,
          lastPort: previousCandidate?.port,
          lastRegion: index === 0 ? undefined : currentRegion,
          nextRegion,
          ripRequired: false,
        }
        this.assertBootstrappedCandidateIsValid({
          connection,
          candidate,
          connectionId,
        })
        path.push(candidate)
        previousCandidate = candidate
        currentRegion = nextRegion
      }
    } finally {
      this.currentConnection = previousConnection
      this.currentEndRegion = previousEndRegion
    }

    if (currentRegion !== connection.endRegion) {
      throw new Error(
        `Solved route ${connectionId} does not terminate in end region ${connection.endRegion.regionId}`,
      )
    }

    return {
      path,
      connection,
      requiredRip: false,
    }
  }

  private assertBootstrappedCandidateIsValid({
    connection,
    candidate,
    connectionId,
  }: {
    connection: Connection
    candidate: Candidate
    connectionId: string
  }) {
    if (candidate.port.assignment) {
      if (
        candidate.port.assignment.connection.mutuallyConnectedNetworkId ===
        connection.mutuallyConnectedNetworkId
      ) {
        throw new Error(
          `Solved route ${connectionId} reuses bootstrapped port ${candidate.port.portId}, but shared port assignments are not yet supported`,
        )
      }
      throw new Error(
        `Solved route ${connectionId} requires ripping existing port usage at ${candidate.port.portId}`,
      )
    }

    if (!candidate.lastPort || !candidate.lastRegion) return

    if (
      !this.isTransitionAllowed(
        candidate.lastRegion as RegionType,
        candidate.lastPort as RegionPortType,
        candidate.port as RegionPortType,
      )
    ) {
      throw new Error(
        `Solved route ${connectionId} has disallowed transition in region ${candidate.lastRegion.regionId} from ${candidate.lastPort.portId} to ${candidate.port.portId}`,
      )
    }

    if (
      this.isRipRequiredForPortUsage(
        candidate.lastRegion as RegionType,
        candidate.lastPort as RegionPortType,
        candidate.port as RegionPortType,
      )
    ) {
      throw new Error(
        `Solved route ${connectionId} requires ripping conflicting assignments in region ${candidate.lastRegion.regionId}`,
      )
    }

    if (
      this.getRipsRequiredForPortUsage(
        candidate.lastRegion as RegionType,
        candidate.lastPort as RegionPortType,
        candidate.port as RegionPortType,
      ).length > 0
    ) {
      throw new Error(
        `Solved route ${connectionId} conflicts with existing assignments in region ${candidate.lastRegion.regionId}`,
      )
    }
  }

  private bootstrapSolvedRoutes({
    inputGraph,
  }: {
    inputGraph: HyperGraph | SerializedHyperGraph
  }) {
    const rawSolvedRoutes = this.getBootstrapSolvedRoutes({ inputGraph })
    if (rawSolvedRoutes.length === 0) return

    const portMap = new Map(this.graph.ports.map((port) => [port.portId, port]))
    const connectionMap = new Map(
      this.connections.map((connection) => [connection.connectionId, connection]),
    )
    const bootstrappedConnectionIds = new Set<string>()

    for (const rawSolvedRoute of rawSolvedRoutes) {
      const connectionId = this.isSerializedInputSolvedRoute(rawSolvedRoute)
        ? rawSolvedRoute.connectionId
        : rawSolvedRoute.connection.connectionId
      if (bootstrappedConnectionIds.has(connectionId)) {
        throw new Error(
          `Duplicate solved route for connection ${connectionId} in input graph`,
        )
      }

      const solvedRoute = this.createBootstrappedRoute({
        rawSolvedRoute,
        portMap,
        connectionMap,
      })
      this.commitSolvedRoute(solvedRoute, { callHook: false })
      bootstrappedConnectionIds.add(connectionId)
    }

    this.unprocessedConnections = this.unprocessedConnections.filter(
      (connection) => !bootstrappedConnectionIds.has(connection.connectionId),
    )
  }

  getNextCandidates(currentCandidate: CandidateType): CandidateType[] {
    const currentRegion = currentCandidate.nextRegion!
    const currentPort = currentCandidate.port
    const nextCandidatesByRegion: Record<RegionId, Candidate[]> = {}
    for (const port of currentRegion.ports) {
      if (port === currentCandidate.port) continue
      if (
        !this.isTransitionAllowed(
          currentRegion as RegionType,
          currentPort as RegionPortType,
          port as RegionPortType,
        )
      ) {
        continue
      }
      const ripRequired =
        (port.assignment &&
          port.assignment.connection.mutuallyConnectedNetworkId !==
            this.currentConnection!.mutuallyConnectedNetworkId) ||
        this.isRipRequiredForPortUsage(
          currentRegion as RegionType,
          currentPort as RegionPortType,
          port as RegionPortType,
        )
      const newCandidate: Partial<Candidate> = {
        port,
        hops: currentCandidate.hops + 1,
        parent: currentCandidate,
        lastRegion: currentRegion,
        nextRegion:
          port.region1 === currentRegion ? port.region2 : port.region1,
        lastPort: currentPort,
        ripRequired,
      }

      if (!this.rippingEnabled && newCandidate.ripRequired) {
        continue
      }

      nextCandidatesByRegion[newCandidate.nextRegion!.regionId] ??= []
      nextCandidatesByRegion[newCandidate.nextRegion!.regionId].push(
        newCandidate as CandidateType,
      )
    }

    const nextCandidates: Candidate[] = []
    for (const regionId in nextCandidatesByRegion) {
      const nextCandidatesInRegion = nextCandidatesByRegion[regionId]
      nextCandidates.push(
        ...this.selectCandidatesForEnteringRegion(nextCandidatesInRegion),
      )
    }

    for (const nextCandidate of nextCandidates) {
      nextCandidate.g = this.computeG(nextCandidate as CandidateType)
      nextCandidate.h = this.computeH(nextCandidate as CandidateType)
      nextCandidate.f =
        nextCandidate.g + nextCandidate.h * this.greedyMultiplier
    }

    return nextCandidates as CandidateType[]
  }

  processSolvedRoute(finalCandidate: CandidateType) {
    const solvedRoute: SolvedRoute = {
      path: [],
      connection: this.currentConnection!,
      requiredRip: false,
    }

    let cursorCandidate: CandidateType | undefined = finalCandidate
    let anyRipsRequired = false
    while (cursorCandidate) {
      anyRipsRequired ||= !!cursorCandidate.ripRequired
      solvedRoute.path.unshift(cursorCandidate)
      cursorCandidate = cursorCandidate.parent as CandidateType | undefined
    }

    if (anyRipsRequired) {
      solvedRoute.requiredRip = true
    }

    const allRoutesToRip = this.computeRoutesToRip(solvedRoute)

    // Rip conflicting routes before committing assignments.
    if (allRoutesToRip.size > 0) {
      solvedRoute.requiredRip = true
      for (const route of allRoutesToRip) {
        this.ripSolvedRoute(route)
      }
    }
    this.commitSolvedRoute(solvedRoute)
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * You can override this to perform actions after a route is solved, e.g.
   * you may want to detect if a solvedRoute.requiredRip is true, in which
   * case you might want to execute a "random rip" to avoid loops or check
   * if we've exceeded a maximum number of rips.
   *
   * You can also use this to shuffle unprocessed routes if a rip occurred, this
   * can also help avoid loops
   */
  routeSolvedHook(solvedRoute: SolvedRoute) {}

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * You can override this to perform actions when a new route begins, e.g.
   * you may want to log or track which connection is being processed.
   */
  routeStartedHook(connection: Connection) {}

  ripSolvedRoute(solvedRoute: SolvedRoute) {
    for (const port of solvedRoute.path.map((candidate) => candidate.port)) {
      port.ripCount = (port.ripCount ?? 0) + 1
      port.region1.assignments = port.region1.assignments?.filter(
        (a) => a.regionPort1 !== port && a.regionPort2 !== port,
      )
      port.region2.assignments = port.region2.assignments?.filter(
        (a) => a.regionPort1 !== port && a.regionPort2 !== port,
      )
      port.assignment = undefined
    }
    this.solvedRoutes = this.solvedRoutes.filter((r) => r !== solvedRoute)
    this.unprocessedConnections.push(solvedRoute.connection)
  }

  beginNewConnection() {
    if (this.unprocessedConnections.length === 0) {
      this.currentConnection = null
      this.currentEndRegion = null
      return
    }
    this.currentConnection = this.unprocessedConnections.shift()!
    this.currentEndRegion = this.currentConnection.endRegion
    this.candidateQueue = new PriorityQueue<Candidate>()
    this.visitedPointsForCurrentConnection.clear()
    this.routeStartedHook(this.currentConnection)
    for (const port of this.currentConnection.startRegion.ports) {
      this.candidateQueue.enqueue({
        port,
        g: 0,
        h: 0,
        f: 0,
        hops: 0,
        ripRequired: false,
        nextRegion:
          port.region1 === this.currentConnection.startRegion
            ? port.region2
            : port.region1,
      })
    }
  }

  override _step() {
    let currentCandidate = this.candidateQueue.dequeue() as CandidateType
    if (!currentCandidate) {
      this.failed = true
      this.error = "Ran out of candidates"
      return
    }
    let visitedPointGScore: GScore | undefined =
      this.visitedPointsForCurrentConnection.get(currentCandidate.port.portId)
    while (true) {
      if (!currentCandidate) break
      // This candidate has not been visited yet, let's move to processing it
      if (visitedPointGScore === undefined) break
      // If this candidate has a better g score than the visited point, let's move to processing it
      if (currentCandidate.g < visitedPointGScore) break
      currentCandidate = this.candidateQueue.dequeue() as CandidateType
      if (!currentCandidate) break
      visitedPointGScore = this.visitedPointsForCurrentConnection.get(
        currentCandidate.port.portId,
      )
    }
    if (!currentCandidate) {
      this.failed = true
      this.error = "Ran out of candidates"
      return
    }
    this.lastCandidate = currentCandidate
    this.visitedPointsForCurrentConnection.set(
      currentCandidate.port.portId,
      currentCandidate.g,
    )

    if (currentCandidate.nextRegion === this.currentEndRegion) {
      this.processSolvedRoute(currentCandidate)
      if (this.unprocessedConnections.length === 0) {
        this.solved = true
        return
      }
      this.beginNewConnection()
      return
    }

    const nextCandidates = this.getNextCandidates(currentCandidate)
    for (const nextCandidate of nextCandidates) {
      this.candidateQueue.enqueue(nextCandidate)
    }
  }
}
