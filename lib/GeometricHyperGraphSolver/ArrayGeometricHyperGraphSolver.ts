import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { compileGraphArena, getOtherRegionIndexForPort } from "../ArrayGraph"
import { convertConnectionsToSerializedConnections } from "../convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "../convertHyperGraphToSerializedHyperGraph"
import { convertSerializedConnectionsToConnections } from "../convertSerializedConnectionsToConnections"
import { convertSerializedHyperGraphToHyperGraph } from "../convertSerializedHyperGraphToHyperGraph"
import { PriorityQueue } from "../PriorityQueue"
import { clearAssignmentsFromGraph, commitSolvedRoutes } from "../solvedRoutes"
import type {
  Candidate,
  Connection,
  RegionPortAssignment,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"
import { visualizeJumperGraphWithSolvedRoutes } from "../JumperGraphSolver/visualizeJumperGraphSolver"
import { computeGeometricCrossingAssignments } from "./computeGeometricCrossingAssignments"
import type {
  GeometricHyperGraph,
  GeometricPort,
  GeometricRegion,
} from "./geometric-types"
import { prepareGeometricHyperGraphForSolver } from "./prepareGeometricHyperGraphForSolver"

type ArrayCandidate = {
  portIndex: number
  lastPortIndex: number
  lastRegionIndex: number
  nextRegionIndex: number
  g: number
  h: number
  f: number
  hops: number
  parent?: ArrayCandidate
}

export const ARRAY_GEOMETRIC_SOLVER_DEFAULTS = {
  distanceWeight: 1,
  intersectionPenalty: 1_000,
  greedyMultiplier: 0.6,
  baseMaxIterations: 4_000,
  additionalMaxIterationsPerConnection: 2_000,
}

export class ArrayGeometricHyperGraphSolver extends BaseSolver {
  graph: GeometricHyperGraph
  connections: Connection[]
  solvedRoutes: SolvedRoute[] = []
  currentConnection: Connection | null = null
  currentEndRegion: GeometricRegion | null = null

  distanceWeight = ARRAY_GEOMETRIC_SOLVER_DEFAULTS.distanceWeight
  intersectionPenalty = ARRAY_GEOMETRIC_SOLVER_DEFAULTS.intersectionPenalty
  greedyMultiplier = ARRAY_GEOMETRIC_SOLVER_DEFAULTS.greedyMultiplier
  baseMaxIterations = ARRAY_GEOMETRIC_SOLVER_DEFAULTS.baseMaxIterations
  additionalMaxIterationsPerConnection =
    ARRAY_GEOMETRIC_SOLVER_DEFAULTS.additionalMaxIterationsPerConnection

  private readonly arena: ReturnType<typeof compileGraphArena>
  private readonly unprocessedConnections: Connection[]
  private readonly regionIndexToRegion: GeometricRegion[]
  private readonly portIndexToPort: GeometricPort[]
  private readonly regionCenterByIndex: Array<{ x: number; y: number }>

  constructor(input: {
    inputGraph: GeometricHyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
    inputSolvedRoutes?: SolvedRoute[]
    distanceWeight?: number
    intersectionPenalty?: number
    greedyMultiplier?: number
    baseMaxIterations?: number
    additionalMaxIterationsPerConnection?: number
  }) {
    super()
    this.graph = prepareGeometricHyperGraphForSolver(
      convertSerializedHyperGraphToHyperGraph(input.inputGraph),
    )
    clearAssignmentsFromGraph(this.graph)
    this.connections = convertSerializedConnectionsToConnections(
      input.inputConnections,
      this.graph,
    )
    this.solvedRoutes = input.inputSolvedRoutes
      ? commitSolvedRoutes({
          graph: this.graph,
          connections: this.connections,
          solvedRoutes: input.inputSolvedRoutes,
        })
      : []

    this.distanceWeight = input.distanceWeight ?? this.distanceWeight
    this.intersectionPenalty =
      input.intersectionPenalty ?? this.intersectionPenalty
    this.greedyMultiplier = input.greedyMultiplier ?? this.greedyMultiplier
    this.baseMaxIterations = input.baseMaxIterations ?? this.baseMaxIterations
    this.additionalMaxIterationsPerConnection =
      input.additionalMaxIterationsPerConnection ??
      this.additionalMaxIterationsPerConnection

    this.arena = compileGraphArena({
      ...convertHyperGraphToSerializedHyperGraph(this.graph),
      connections: convertConnectionsToSerializedConnections(this.connections),
    })
    this.regionIndexToRegion = this.graph.regions as GeometricRegion[]
    this.portIndexToPort = this.graph.ports as GeometricPort[]
    this.regionCenterByIndex = this.regionIndexToRegion.map(
      (region) => region.d.center,
    )

    const solvedConnectionIds = new Set(
      this.solvedRoutes.map((route) => route.connection.connectionId),
    )
    this.unprocessedConnections = this.connections.filter(
      (connection) => !solvedConnectionIds.has(connection.connectionId),
    )

    this.MAX_ITERATIONS =
      this.baseMaxIterations +
      this.connections.length * this.additionalMaxIterationsPerConnection

    if (this.unprocessedConnections.length === 0) {
      this.solved = true
    }
  }

  override getSolverName(): string {
    return "ArrayGeometricHyperGraphSolver"
  }

  override getOutput() {
    return this.solvedRoutes
  }

  override _step() {
    while (this.unprocessedConnections.length > 0) {
      const connection = this.unprocessedConnections.shift()!
      this.currentConnection = connection
      this.currentEndRegion = connection.endRegion as GeometricRegion

      const solvedRoute = this.solveConnection(connection)
      if (!solvedRoute) {
        this.error = `Ran out of candidates for ${connection.connectionId}`
        this.failed = true
        return
      }

      this.commitSolvedRoute(solvedRoute)
    }

    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeJumperGraphWithSolvedRoutes({
      graph: this.graph as any,
      connections: this.connections,
      solvedRoutes: this.solvedRoutes,
      title: "Array geometric solver",
    })
  }

  computeIncreasedRegionCostIfPortsAreUsed(
    region: GeometricRegion,
    port1: GeometricPort,
    port2: GeometricPort,
  ): number {
    return (
      this.distanceBetweenPorts(port1, port2) +
      this.intersectionPenalty *
        computeGeometricCrossingAssignments(region, port1, port2).filter(
          (assignment) =>
            assignment.connection.mutuallyConnectedNetworkId !==
            this.currentConnection!.mutuallyConnectedNetworkId,
        ).length
    )
  }

  private solveConnection(connection: Connection): SolvedRoute | null {
    const startRegionIndex = this.arena.regionIdToIndex.get(
      connection.startRegion.regionId,
    )
    const endRegionIndex = this.arena.regionIdToIndex.get(
      connection.endRegion.regionId,
    )
    if (startRegionIndex === undefined || endRegionIndex === undefined) {
      throw new Error(
        `Connection ${connection.connectionId} references missing region`,
      )
    }

    const queue = new PriorityQueue<ArrayCandidate>()
    const bestGByPort = new Map<number, number>()

    const start = this.arena.regionPortStart[startRegionIndex]!
    const end = this.arena.regionPortStart[startRegionIndex + 1]!
    for (let i = start; i < end; i++) {
      const portIndex = this.arena.regionPortIndex[i]!
      const nextRegionIndex = getOtherRegionIndexForPort(
        this.arena,
        portIndex,
        startRegionIndex,
      )
      const h = this.distanceToEndFromPort(portIndex, endRegionIndex)
      queue.enqueue({
        portIndex,
        lastPortIndex: -1,
        lastRegionIndex: -1,
        nextRegionIndex,
        g: 0,
        h,
        f: h * this.greedyMultiplier,
        hops: 0,
      })
    }

    while (!queue.isEmpty()) {
      const current = queue.dequeue()!
      const bestKnown = bestGByPort.get(current.portIndex)
      if (bestKnown !== undefined && bestKnown <= current.g) {
        continue
      }
      bestGByPort.set(current.portIndex, current.g)

      if (current.nextRegionIndex === endRegionIndex) {
        return this.materializeSolvedRoute(connection, current)
      }

      const regionStart = this.arena.regionPortStart[current.nextRegionIndex]!
      const regionEnd = this.arena.regionPortStart[current.nextRegionIndex + 1]!

      for (let i = regionStart; i < regionEnd; i++) {
        const nextPortIndex = this.arena.regionPortIndex[i]!
        if (nextPortIndex === current.portIndex) continue

        const nextRegionIndex = getOtherRegionIndexForPort(
          this.arena,
          nextPortIndex,
          current.nextRegionIndex,
        )
        const transitionCost = this.computeTransitionCost(
          current.nextRegionIndex,
          current.portIndex,
          nextPortIndex,
        )
        const g = current.g + transitionCost
        const h = this.distanceToEndFromPort(nextPortIndex, endRegionIndex)
        queue.enqueue({
          portIndex: nextPortIndex,
          lastPortIndex: current.portIndex,
          lastRegionIndex: current.nextRegionIndex,
          nextRegionIndex,
          g,
          h,
          f: g + h * this.greedyMultiplier,
          hops: current.hops + 1,
          parent: current,
        })
      }
    }

    return null
  }

  private computeTransitionCost(
    regionIndex: number,
    firstPortIndex: number,
    secondPortIndex: number,
  ): number {
    const region = this.regionIndexToRegion[regionIndex]!
    const port1 = this.portIndexToPort[firstPortIndex]!
    const port2 = this.portIndexToPort[secondPortIndex]!
    return this.computeIncreasedRegionCostIfPortsAreUsed(region, port1, port2)
  }

  private distanceToEndFromPort(
    portIndex: number,
    endRegionIndex: number,
  ): number {
    const port = this.portIndexToPort[portIndex]!
    const endCenter = this.regionCenterByIndex[endRegionIndex]!
    return (
      Math.hypot(port.d.x - endCenter.x, port.d.y - endCenter.y) *
      this.distanceWeight
    )
  }

  private distanceBetweenPorts(port1: GeometricPort, port2: GeometricPort) {
    return (
      Math.hypot(port1.d.x - port2.d.x, port1.d.y - port2.d.y) *
      this.distanceWeight
    )
  }

  private materializeSolvedRoute(
    connection: Connection,
    finalCandidate: ArrayCandidate,
  ): SolvedRoute {
    const candidates: Candidate[] = []
    const arrayPath: ArrayCandidate[] = []
    let cursor: ArrayCandidate | undefined = finalCandidate
    while (cursor) {
      arrayPath.unshift(cursor)
      cursor = cursor.parent
    }

    for (let i = 0; i < arrayPath.length; i++) {
      const candidate = arrayPath[i]!
      const port = this.portIndexToPort[candidate.portIndex]!
      const lastPort =
        candidate.lastPortIndex !== -1
          ? this.portIndexToPort[candidate.lastPortIndex]!
          : undefined
      const lastRegion =
        candidate.lastRegionIndex !== -1
          ? this.regionIndexToRegion[candidate.lastRegionIndex]!
          : undefined
      const nextRegion = this.regionIndexToRegion[candidate.nextRegionIndex]!

      candidates.push({
        port,
        g: candidate.g,
        h: candidate.h,
        f: candidate.f,
        hops: i,
        ripRequired: false,
        parent: i > 0 ? candidates[i - 1] : undefined,
        lastPort,
        lastRegion,
        nextRegion,
      })
    }

    return {
      path: candidates,
      connection,
      requiredRip: false,
    }
  }

  private commitSolvedRoute(solvedRoute: SolvedRoute) {
    for (const candidate of solvedRoute.path) {
      candidate.port.assignment = {
        solvedRoute,
        connection: solvedRoute.connection,
      }
      if (!candidate.lastPort || !candidate.lastRegion) continue

      const assignment: RegionPortAssignment = {
        regionPort1: candidate.lastPort,
        regionPort2: candidate.port,
        region: candidate.lastRegion,
        connection: solvedRoute.connection,
        solvedRoute,
      }
      candidate.lastRegion.assignments ??= []
      candidate.lastRegion.assignments.push(assignment)
    }

    this.solvedRoutes.push(solvedRoute)
  }
}
