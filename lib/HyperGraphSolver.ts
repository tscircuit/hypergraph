import { BaseSolver } from "@tscircuit/solver-utils"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
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
  ConnectionId,
} from "./types"
import { convertSerializedConnectionsToConnections } from "./convertSerializedConnectionsToConnections"
import { PriorityQueue } from "./PriorityQueue"

export type SolvedRoute = {
  path: Candidate[]
  connection: Connection
}

export class HyperGraphSolver extends BaseSolver {
  graph: HyperGraph
  connections: Connection[]

  candidateQueue: PriorityQueue<Candidate>
  unprocessedConnections: Connection[]

  solvedRoutes: SolvedRoute[] = []
  assignedPorts: Map<PortId, SolvedRoute> = new Map()

  currentConnection: Connection | null = null
  currentEndRegion: Region | null = null

  greedyMultiplier = 1.0

  lastCandidate: Candidate | null = null

  visitedPointsForCurrentConnection: Set<PortId> = new Set()

  constructor(
    public input: {
      inputGraph: HyperGraph | SerializedHyperGraph
      inputConnections: (Connection | SerializedConnection)[]
      greedyMultiplier?: number
    },
  ) {
    super()
    this.graph = convertSerializedHyperGraphToHyperGraph(input.inputGraph)
    this.connections = convertSerializedConnectionsToConnections(
      input.inputConnections,
      this.graph,
    )
    if (input.greedyMultiplier) this.greedyMultiplier = input.greedyMultiplier
    this.unprocessedConnections = [...this.connections]
    this.currentConnection = this.unprocessedConnections.shift()!
    this.candidateQueue = new PriorityQueue<Candidate>()
    this.candidateQueue.enqueue({
      port: this.currentConnection.startRegion.ports[0],
      g: 0,
      h: 0,
      f: 0,
      hops: 0,
    })
    this.currentEndRegion = this.currentConnection.endRegion
  }

  computeH(candidate: Candidate): number {
    return 0
  }

  computeG(candidate: Candidate): number {
    return 0
  }

  selectCandidatesForRegion(candidates: Candidate[]): Candidate[] {
    return candidates
  }

  getNextCandidates(candidate: Candidate): Candidate[] {
    const currentRegion = candidate.nextRegion!
    const currentPort = candidate.port
    const nextCandidatesByRegion: Record<RegionId, Candidate[]> = {}
    for (const port of currentRegion.ports) {
      if (port === candidate.port) continue
      const newCandidate: Partial<Candidate> = {
        port,
        hops: candidate.hops + 1,
        parent: candidate,
        lastRegion: currentRegion,
        nextRegion:
          port.region1 === currentRegion ? port.region2 : port.region1,
        lastPort: currentPort,
      }
      nextCandidatesByRegion[newCandidate.nextRegion!.regionId] ??= []
      nextCandidatesByRegion[newCandidate.nextRegion!.regionId].push(
        newCandidate as Candidate,
      )
    }

    const nextCandidates: Candidate[] = []
    for (const regionId in nextCandidatesByRegion) {
      const nextCandidatesInRegion = nextCandidatesByRegion[regionId]
      nextCandidates.push(
        ...this.selectCandidatesForRegion(nextCandidatesInRegion),
      )
    }

    for (const nextCandidate of nextCandidates) {
      nextCandidate.g = this.computeG(nextCandidate as Candidate)
      nextCandidate.h = this.computeH(nextCandidate as Candidate)
      nextCandidate.f =
        nextCandidate.g + nextCandidate.h * this.greedyMultiplier
    }
    return nextCandidates
  }

  override _step() {
    const currentCandidate = this.candidateQueue.dequeue()
    if (!currentCandidate) {
      this.failed = true
      this.error = "Ran out of candidates"
      return
    }
    this.lastCandidate = currentCandidate
    this.visitedPointsForCurrentConnection.add(currentCandidate.port.portId)

    if (currentCandidate.nextRegion === this.currentEndRegion) {
      return
    }

    const nextCandidates = this.getNextCandidates(currentCandidate)
    for (const nextCandidate of nextCandidates) {
      this.candidateQueue.enqueue(nextCandidate)
    }
  }
}
