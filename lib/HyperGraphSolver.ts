import { BaseSolver } from "@tscircuit/solver-utils"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
import { convertHyperGraphToSerializedHyperGraph } from "./convertHyperGraphToSerializedHyperGraph"
import { convertConnectionsToSerializedConnections } from "./convertConnectionsToSerializedConnections"
import type {
  Candidate,
  Connection,
  RegionPort,
  PortId,
  HyperGraph,
  SerializedConnection,
  SerializedHyperGraph,
  Region,
  RegionId,
  SolvedRoute,
  RegionPortAssignment,
  GScore,
  RipViabilityResult,
} from "./types"
import { convertSerializedConnectionsToConnections } from "./convertSerializedConnectionsToConnections"
import { PriorityQueue } from "./PriorityQueue"

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

  partialRippingEnabled = false
  ripThresholdMultiplier = 1.0
  maxCumulativeRipCost = Infinity

  lastCandidate: Candidate | null = null

  visitedPointsForCurrentConnection: Map<PortId, GScore> = new Map()
  totalRipCostThisRoute = 0
  ripsPerformedThisRoute = 0

  constructor(
    public input: {
      inputGraph: HyperGraph | SerializedHyperGraph
      inputConnections: (Connection | SerializedConnection)[]
      greedyMultiplier?: number
      rippingEnabled?: boolean
      ripCost?: number
      partialRippingEnabled?: boolean
      ripThresholdMultiplier?: number
      maxCumulativeRipCost?: number
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
    if (input.partialRippingEnabled !== undefined)
      this.partialRippingEnabled = input.partialRippingEnabled
    if (input.ripThresholdMultiplier !== undefined)
      this.ripThresholdMultiplier = input.ripThresholdMultiplier
    if (input.maxCumulativeRipCost !== undefined)
      this.maxCumulativeRipCost = input.maxCumulativeRipCost
    this.unprocessedConnections = [...this.connections]
    this.candidateQueue = new PriorityQueue<Candidate>()
    this.beginNewConnection()
  }

  override getConstructorParams() {
    return {
      inputGraph: convertHyperGraphToSerializedHyperGraph(this.graph),
      inputConnections: convertConnectionsToSerializedConnections(
        this.connections,
      ),
      greedyMultiplier: this.greedyMultiplier,
      rippingEnabled: this.rippingEnabled,
      ripCost: this.ripCost,
      partialRippingEnabled: this.partialRippingEnabled,
      ripThresholdMultiplier: this.ripThresholdMultiplier,
      maxCumulativeRipCost: this.maxCumulativeRipCost,
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
   * Estimate the cost of ripping a particular solved route. This is used
   * in partial ripping mode to decide whether a rip is worth performing.
   * Default implementation uses the route length as a proxy for cost.
   */
  estimateRipCost(solvedRoute: SolvedRoute): number {
    return solvedRoute.path.length * this.ripCost
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * Evaluate whether a particular rip should be performed given the cost.
   * Used in partial ripping mode to make threshold-based decisions.
   * Returns an object indicating whether to rip and the estimated cost.
   */
  evaluateRipViability(
    targetRoute: SolvedRoute,
    currentTotalRipCost: number,
  ): RipViabilityResult {
    if (!this.partialRippingEnabled) {
      return { shouldRip: true, estimatedCost: 0 }
    }

    const estimatedCost = this.estimateRipCost(targetRoute)
    const threshold = this.ripCost * this.ripThresholdMultiplier
    const wouldExceedMax =
      currentTotalRipCost + estimatedCost > this.maxCumulativeRipCost

    if (estimatedCost > threshold) {
      return {
        shouldRip: false,
        estimatedCost,
        reason: `Rip cost (${estimatedCost.toFixed(2)}) exceeds threshold (${threshold.toFixed(2)})`,
      }
    }

    if (wouldExceedMax) {
      return {
        shouldRip: false,
        estimatedCost,
        reason: `Would exceed max cumulative rip cost (${(currentTotalRipCost + estimatedCost).toFixed(2)} > ${this.maxCumulativeRipCost.toFixed(2)})`,
      }
    }

    return {
      shouldRip: true,
      estimatedCost,
    }
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

  getNextCandidates(currentCandidate: CandidateType): CandidateType[] {
    const currentRegion = currentCandidate.nextRegion!
    const currentPort = currentCandidate.port
    const nextCandidatesByRegion: Record<RegionId, Candidate[]> = {}
    for (const port of currentRegion.ports) {
      if (port === currentCandidate.port) continue
      const ripRequired =
        port.assignment &&
        port.assignment.connection.mutuallyConnectedNetworkId !==
          this.currentConnection!.mutuallyConnectedNetworkId
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

    // Rip any routes that are connected to the solved route (port reuse) and requeue
    const routesToRip: Set<SolvedRoute> = new Set()
    if (anyRipsRequired) {
      solvedRoute.requiredRip = true
      for (const candidate of solvedRoute.path) {
        if (
          candidate.port.assignment &&
          candidate.port.assignment.connection.mutuallyConnectedNetworkId !==
            this.currentConnection!.mutuallyConnectedNetworkId
        ) {
          routesToRip.add(candidate.port.assignment.solvedRoute)
        }
      }
    }

    // Check for rips required due to port usage (crossing assignments)
    for (const candidate of solvedRoute.path) {
      if (!candidate.lastPort || !candidate.lastRegion) continue
      const ripsRequired = this.getRipsRequiredForPortUsage(
        candidate.lastRegion as RegionType,
        candidate.lastPort as RegionPortType,
        candidate.port as RegionPortType,
      )
      for (const assignment of ripsRequired) {
        routesToRip.add(assignment.solvedRoute)
      }
    }

    // Handle ripping with partial ripping logic if enabled
    if (routesToRip.size > 0) {
      solvedRoute.requiredRip = true

      if (this.partialRippingEnabled) {
        // In partial ripping mode, evaluate each rip before performing it
        let totalRipCostThisRoute = 0
        const routesToRipArray = Array.from(routesToRip)
        const routesToActuallyRip: SolvedRoute[] = []

        for (const route of routesToRipArray) {
          const viability = this.evaluateRipViability(
            route,
            totalRipCostThisRoute,
          )
          if (viability.shouldRip) {
            routesToActuallyRip.push(route)
            totalRipCostThisRoute += viability.estimatedCost
          }
        }

        // If we couldn't rip all required routes due to cost thresholds,
        // reject this solution and requeue the connection
        if (routesToActuallyRip.length < routesToRipArray.length) {
          this.unprocessedConnections.push(this.currentConnection!)
          if (this.unprocessedConnections.length === 0) {
            this.solved = true
            return
          }
          this.beginNewConnection()
          return
        }

        // Perform the rips that passed viability checks
        for (const route of routesToActuallyRip) {
          this.ripSolvedRoute(route)
        }
      } else {
        // Original behavior: unconditional ripping
        for (const route of routesToRip) {
          this.ripSolvedRoute(route)
        }
      }
    }

    for (const candidate of solvedRoute.path) {
      candidate.port.assignment = {
        solvedRoute,
        connection: this.currentConnection!,
      }
      if (!candidate.lastPort) continue
      const regionPortAssignment: RegionPortAssignment = {
        regionPort1: candidate.lastPort,
        regionPort2: candidate.port,
        region: candidate.lastRegion!,
        connection: this.currentConnection!,
        solvedRoute,
      }
      candidate.lastRegion!.assignments?.push(regionPortAssignment)
    }

    this.solvedRoutes.push(solvedRoute)
    this.routeSolvedHook(solvedRoute)
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
    this.currentConnection = this.unprocessedConnections.shift()!
    this.currentEndRegion = this.currentConnection.endRegion
    this.candidateQueue = new PriorityQueue<Candidate>()
    this.visitedPointsForCurrentConnection.clear()
    this.totalRipCostThisRoute = 0
    this.ripsPerformedThisRoute = 0
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
