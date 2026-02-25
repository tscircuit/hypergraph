/// <reference types="bun-types" />
import { describe, it, expect } from "bun:test"
import "graphics-debug/matcher"
import type { GraphicsObject } from "graphics-debug"
import {
  HyperGraphPartialRipping,
  createPartialRippingSolver,
} from "../../lib/HyperGraphPartialRipping"
import type {
  HyperGraph,
  Connection,
  SolvedRoute,
  Region,
  RegionPort,
} from "../../lib/types"

function visualizeSolver(solver: HyperGraphPartialRipping): GraphicsObject {
  const regionPositions = new Map<string, { x: number; y: number }>()
  const portPositions = new Map<string, { x: number; y: number }>()

  const cols = 2
  const spacing = 200
  solver.graph.regions.forEach((region, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    regionPositions.set(region.regionId, {
      x: col * spacing,
      y: row * spacing,
    })
  })

  for (const port of solver.graph.ports) {
    const r1Pos = regionPositions.get(port.region1.regionId)!
    const r2Pos = regionPositions.get(port.region2.regionId)!
    portPositions.set(port.portId, {
      x: (r1Pos.x + r2Pos.x) / 2,
      y: (r1Pos.y + r2Pos.y) / 2,
    })
  }

  const points: NonNullable<GraphicsObject["points"]> = []
  const lines: NonNullable<GraphicsObject["lines"]> = []

  // Region labels (blue dots)
  for (const region of solver.graph.regions) {
    const pos = regionPositions.get(region.regionId)!
    const assignmentCount = region.assignments?.length ?? 0
    points.push({
      x: pos.x,
      y: pos.y,
      label: `${region.regionId} (${assignmentCount} asgn)`,
      color: "blue",
    })
  }

  // Port labels (green=assigned, gray=free)
  for (const port of solver.graph.ports) {
    const pos = portPositions.get(port.portId)!
    points.push({
      x: pos.x,
      y: pos.y,
      label: `${port.portId}${port.assignment ? " ✓" : ""}`,
      color: port.assignment ? "green" : "gray",
    })
  }

  // Graph topology edges (light gray)
  for (const port of solver.graph.ports) {
    const r1Pos = regionPositions.get(port.region1.regionId)!
    const r2Pos = regionPositions.get(port.region2.regionId)!
    lines.push({
      points: [
        { x: r1Pos.x, y: r1Pos.y },
        { x: r2Pos.x, y: r2Pos.y },
      ],
      strokeColor: "lightgray",
    })
  }

  // Solved routes as colored polylines
  const routeColors = ["red", "blue", "green", "orange", "purple", "cyan"]
  solver.solvedRoutes.forEach((route, routeIdx) => {
    const color = routeColors[routeIdx % routeColors.length]
    const routePoints: { x: number; y: number }[] = []

    for (const candidate of route.path) {
      const pos = portPositions.get(candidate.port.portId)
      if (pos) routePoints.push({ x: pos.x, y: pos.y })
    }

    if (routePoints.length >= 2) {
      const offset = (routeIdx - solver.solvedRoutes.length / 2) * 8
      lines.push({
        points: routePoints.map((p) => ({
          x: p.x + offset,
          y: p.y + offset,
        })),
        strokeColor: color,
      })
    }

    if (routePoints.length > 0) {
      const mid = routePoints[Math.floor(routePoints.length / 2)]
      points.push({
        x: mid.x + 15,
        y: mid.y + 15,
        label: `${route.connection.connectionId}${route.requiredRip ? " (ripped)" : ""}`,
        color,
      })
    }
  })

  const diag = solver.getRipDiagnostics()
  const title = [
    solver.solved ? "SOLVED" : solver.failed ? "FAILED" : "IN PROGRESS",
    `Routes: ${solver.solvedRoutes.length}/${solver.connections.length}`,
    `Rips: ${diag.totalRipsPerformed}`,
    `Skipped: ${diag.ripsSkippedDueToThreshold}`,
    `Strategy: ${diag.ripStrategy}`,
  ].join(" | ")

  return { points, lines, title }
}

function createTestGraph(): { graph: HyperGraph; connections: Connection[] } {
  const r1: Region = { regionId: "r1", ports: [], d: {} }
  const r2: Region = { regionId: "r2", ports: [], d: {} }
  const r3: Region = { regionId: "r3", ports: [], d: {} }
  const r4: Region = { regionId: "r4", ports: [], d: {} }

  const p1: RegionPort = { portId: "p1", region1: r1, region2: r2, d: {} }
  const p2: RegionPort = { portId: "p2", region1: r2, region2: r3, d: {} }
  const p3: RegionPort = { portId: "p3", region1: r1, region2: r4, d: {} }
  const p4: RegionPort = { portId: "p4", region1: r4, region2: r3, d: {} }
  const p5: RegionPort = { portId: "p5", region1: r2, region2: r4, d: {} }

  r1.ports = [p1, p3]
  r2.ports = [p1, p2, p5]
  r3.ports = [p2, p4]
  r4.ports = [p3, p4, p5]

  const graph: HyperGraph = {
    ports: [p1, p2, p3, p4, p5],
    regions: [r1, r2, r3, r4],
  }

  const conn1: Connection = {
    connectionId: "conn1",
    mutuallyConnectedNetworkId: "net1",
    startRegion: r1,
    endRegion: r3,
  }
  const conn2: Connection = {
    connectionId: "conn2",
    mutuallyConnectedNetworkId: "net2",
    startRegion: r2,
    endRegion: r4,
  }

  return { graph, connections: [conn1, conn2] }
}

function createRipCandidateGraph(): {
  graph: HyperGraph
  connections: Connection[]
} {
  const r1: Region = { regionId: "r1", ports: [], d: {} }
  const r2: Region = { regionId: "r2", ports: [], d: {} }
  const r3: Region = { regionId: "r3", ports: [], d: {} }
  const r4: Region = { regionId: "r4", ports: [], d: {} }
  const r5: Region = { regionId: "r5", ports: [], d: {} }

  const p1: RegionPort = { portId: "p1", region1: r1, region2: r2, d: {} }
  const p2: RegionPort = { portId: "p2", region1: r2, region2: r3, d: {} }
  const p3: RegionPort = { portId: "p3", region1: r1, region2: r4, d: {} }
  const p4: RegionPort = { portId: "p4", region1: r4, region2: r3, d: {} }
  const p5: RegionPort = { portId: "p5", region1: r5, region2: r2, d: {} }

  r1.ports = [p1, p3]
  r2.ports = [p1, p2, p5]
  r3.ports = [p2, p4]
  r4.ports = [p3, p4]
  r5.ports = [p5]

  const graph: HyperGraph = {
    ports: [p1, p2, p3, p4, p5],
    regions: [r1, r2, r3, r4, r5],
  }

  const conn1: Connection = {
    connectionId: "conn1",
    mutuallyConnectedNetworkId: "net1",
    startRegion: r1,
    endRegion: r3,
  }
  const conn2: Connection = {
    connectionId: "conn2",
    mutuallyConnectedNetworkId: "net2",
    startRegion: r5,
    endRegion: r3,
  }

  return { graph, connections: [conn1, conn2] }
}

/** Run solver to completion with a safety cap. */
function runSolverToCompletion(
  solver: HyperGraphPartialRipping,
  maxSteps = 1000,
): HyperGraphPartialRipping {
  let steps = 0
  while (!solver.solved && !solver.failed && steps < maxSteps) {
    solver.step()
    steps++
  }
  return solver
}

describe("HyperGraphPartialRipping", () => {
  describe("shouldRipRoutes", () => {
    it("should return all routes when strategy is 'all'", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        ripStrategy: "all",
        ripCost: 10,
      })

      const mockRoute1: SolvedRoute = {
        path: [{ port: graph.ports[0] }] as any,
        connection: connections[0],
        requiredRip: false,
      }
      const mockRoute2: SolvedRoute = {
        path: [{ port: graph.ports[1] }] as any,
        connection: connections[1],
        requiredRip: false,
      }

      const candidateRoutes = new Set([mockRoute1, mockRoute2])
      const result = solver.shouldRipRoutes(candidateRoutes)

      expect(result.size).toBe(2)
      expect(result.has(mockRoute1)).toBe(true)
      expect(result.has(mockRoute2)).toBe(true)
    })

    it("should return empty set when strategy is 'none' and threshold exceeded", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        ripStrategy: "none",
        ripCost: 100,
        ripCostThreshold: 50,
      })

      const mockRoute1: SolvedRoute = {
        path: [{ port: graph.ports[0] }] as any,
        connection: connections[0],
        requiredRip: false,
      }

      const candidateRoutes = new Set([mockRoute1])
      const result = solver.shouldRipRoutes(candidateRoutes)

      expect(result.size).toBe(0)
      expect(solver.ripsSkippedDueToThreshold).toBe(1)
    })

    it("should return all routes when under threshold with 'none' strategy", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        ripStrategy: "none",
        ripCost: 10,
        ripCostThreshold: 100,
      })

      const mockRoute1: SolvedRoute = {
        path: [{ port: graph.ports[0] }] as any,
        connection: connections[0],
        requiredRip: false,
      }

      const candidateRoutes = new Set([mockRoute1])
      const result = solver.shouldRipRoutes(candidateRoutes)

      expect(result.size).toBe(1)
    })

    it("should select cheapest routes when strategy is 'cheapest'", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        ripStrategy: "cheapest",
        ripCost: 10,
        ripCostThreshold: 25,
      })

      const cheapRoute: SolvedRoute = {
        path: [{ port: graph.ports[0] }] as any,
        connection: connections[0],
        requiredRip: false,
      }
      const expensiveRoute: SolvedRoute = {
        path: [
          { port: graph.ports[1] },
          { port: graph.ports[2] },
          { port: graph.ports[3] },
        ] as any,
        connection: connections[1],
        requiredRip: false,
      }

      const candidateRoutes = new Set([cheapRoute, expensiveRoute])
      const result = solver.shouldRipRoutes(candidateRoutes)

      expect(result.size).toBe(1)
      expect(result.has(cheapRoute)).toBe(true)
      expect(result.has(expensiveRoute)).toBe(false)
    })

    it("should respect maxRoutesToRip limit", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        ripStrategy: "all",
        ripCost: 10,
        maxRoutesToRip: 1,
      })

      const mockRoute1: SolvedRoute = {
        path: [{ port: graph.ports[0] }] as any,
        connection: connections[0],
        requiredRip: false,
      }
      const mockRoute2: SolvedRoute = {
        path: [{ port: graph.ports[1] }] as any,
        connection: connections[1],
        requiredRip: false,
      }

      const candidateRoutes = new Set([mockRoute1, mockRoute2])
      const result = solver.shouldRipRoutes(candidateRoutes)

      expect(result.size).toBe(1)
    })

    it("should return empty set for empty input", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
      })

      const result = solver.shouldRipRoutes(new Set())
      expect(result.size).toBe(0)
    })
  })

  describe("calculateRipCost", () => {
    it("should calculate cost based on path length and ripCost", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        ripCost: 15,
      })

      const route: SolvedRoute = {
        path: [
          { port: graph.ports[0] },
          { port: graph.ports[1] },
          { port: graph.ports[2] },
        ] as any,
        connection: connections[0],
        requiredRip: false,
      }

      expect(solver.calculateRipCost(route)).toBe(45)
    })
  })

  describe("ripSolvedRoute", () => {
    it("should increment totalRipsPerformed when a route is ripped", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        rippingEnabled: true,
        ripCost: 10,
      })

      // Run solver to get at least one solved route
      runSolverToCompletion(solver)
      expect(solver.solvedRoutes.length).toBeGreaterThanOrEqual(1)

      const routeToRip = solver.solvedRoutes[0]
      const routeCountBefore = solver.solvedRoutes.length
      const ripCountBefore = solver.totalRipsPerformed

      // Manually rip the route
      solver.ripSolvedRoute(routeToRip)

      expect(solver.totalRipsPerformed).toBe(ripCountBefore + 1)
      expect(solver.solvedRoutes.length).toBe(routeCountBefore - 1)
    })
  })

  describe("getRipDiagnostics", () => {
    it("should return correct diagnostics", () => {
      const { graph, connections } = createTestGraph()
      const solver = new HyperGraphPartialRipping({
        inputGraph: graph,
        inputConnections: connections,
        ripCostThreshold: 100,
        maxRoutesToRip: 5,
        ripStrategy: "cheapest",
      })

      expect(solver.getRipDiagnostics()).toEqual({
        totalRipsPerformed: 0,
        ripsSkippedDueToThreshold: 0,
        ripCostThreshold: 100,
        maxRoutesToRip: 5,
        ripStrategy: "cheapest",
      })
    })
  })

  describe("createPartialRippingSolver factory", () => {
    it("should create solver with conservative preset", () => {
      const { graph, connections } = createTestGraph()
      const solver = createPartialRippingSolver({
        inputGraph: graph,
        inputConnections: connections,
        preset: "conservative",
      })

      expect(solver.ripCostThreshold).toBe(50)
      expect(solver.maxRoutesToRip).toBe(2)
      expect(solver.ripStrategy).toBe("cheapest")
    })

    it("should create solver with moderate preset", () => {
      const { graph, connections } = createTestGraph()
      const solver = createPartialRippingSolver({
        inputGraph: graph,
        inputConnections: connections,
        preset: "moderate",
      })

      expect(solver.ripCostThreshold).toBe(150)
      expect(solver.maxRoutesToRip).toBe(5)
      expect(solver.ripStrategy).toBe("cheapest")
    })

    it("should create solver with aggressive preset", () => {
      const { graph, connections } = createTestGraph()
      const solver = createPartialRippingSolver({
        inputGraph: graph,
        inputConnections: connections,
        preset: "aggressive",
      })

      expect(solver.ripCostThreshold).toBe(Infinity)
      expect(solver.maxRoutesToRip).toBe(Infinity)
      expect(solver.ripStrategy).toBe("all")
    })

    it("should allow explicit overrides of preset values", () => {
      const { graph, connections } = createTestGraph()
      const solver = createPartialRippingSolver({
        inputGraph: graph,
        inputConnections: connections,
        preset: "conservative",
        ripCostThreshold: 200,
      })

      expect(solver.ripCostThreshold).toBe(200)
      expect(solver.maxRoutesToRip).toBe(2)
    })
  })
})

describe("Integration: HyperGraphPartialRipping solving", () => {
  it("should solve simple graph without ripping", async () => {
    const r1: Region = { regionId: "r1", ports: [], d: {} }
    const r2: Region = { regionId: "r2", ports: [], d: {} }

    const p1: RegionPort = { portId: "p1", region1: r1, region2: r2, d: {} }

    r1.ports = [p1]
    r2.ports = [p1]

    const graph: HyperGraph = {
      ports: [p1],
      regions: [r1, r2],
    }

    const conn: Connection = {
      connectionId: "conn1",
      mutuallyConnectedNetworkId: "net1",
      startRegion: r1,
      endRegion: r2,
    }

    const solver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: [conn],
    })

    runSolverToCompletion(solver)

    expect(solver.solved).toBe(true)
    expect(solver.solvedRoutes.length).toBe(1)
    expect(solver.totalRipsPerformed).toBe(0)

    // Visual snapshot
    await expect(visualizeSolver(solver)).toMatchGraphicsSvg(import.meta.path, {
      svgName: "simple-graph-no-ripping",
    })

    // Data snapshots
    expect(
      solver.solvedRoutes.map((r) => ({
        connectionId: r.connection.connectionId,
        pathLength: r.path.length,
        requiredRip: r.requiredRip,
      })),
    ).toMatchSnapshot()

    expect(solver.getRipDiagnostics()).toMatchSnapshot()
  })

  it("should solve multi-connection graph without conflicts", async () => {
    const { graph, connections } = createTestGraph()

    const solver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: connections,
      ripStrategy: "all",
      ripCost: 10,
    })

    runSolverToCompletion(solver)

    expect(solver.solved).toBe(true)
    expect(solver.solvedRoutes.length).toBe(2)

    // Visual snapshot
    await expect(visualizeSolver(solver)).toMatchGraphicsSvg(import.meta.path, {
      svgName: "multi-connection-no-conflict",
    })

    // Data snapshots
    expect(
      solver.solvedRoutes.map((r) => ({
        connectionId: r.connection.connectionId,
        networkId: r.connection.mutuallyConnectedNetworkId,
        pathPortIds: r.path.map((c) => c.port.portId),
        requiredRip: r.requiredRip,
      })),
    ).toMatchSnapshot()

    expect(solver.getRipDiagnostics()).toMatchSnapshot()
  })

  it("should solve rip-candidate graph with aggressive strategy", async () => {
    const { graph, connections } = createRipCandidateGraph()

    const solver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: connections,
      rippingEnabled: true,
      ripStrategy: "all",
      ripCost: 10,
    })

    runSolverToCompletion(solver)

    expect(solver.solved).toBe(true)
    expect(solver.solvedRoutes.length).toBe(2)

    // Visual snapshot — shows whether ripping occurred via route labels
    await expect(visualizeSolver(solver)).toMatchGraphicsSvg(import.meta.path, {
      svgName: "rip-candidate-aggressive",
    })

    // Data snapshot captures exact paths, rip flags, and diagnostics
    expect({
      solvedRoutes: solver.solvedRoutes.map((r) => ({
        connectionId: r.connection.connectionId,
        pathPortIds: r.path.map((c) => c.port.portId),
        requiredRip: r.requiredRip,
      })),
      diagnostics: solver.getRipDiagnostics(),
    }).toMatchSnapshot()
  })

  it("should solve rip-candidate graph with conservative preset", async () => {
    const { graph, connections } = createRipCandidateGraph()

    const solver = createPartialRippingSolver({
      inputGraph: graph,
      inputConnections: connections,
      preset: "conservative",
    })

    runSolverToCompletion(solver)

    const finalState = solver.solved ? "solved" : "failed"

    // Visual snapshot
    await expect(visualizeSolver(solver)).toMatchGraphicsSvg(import.meta.path, {
      svgName: "rip-candidate-conservative",
    })

    // Outcome + diagnostics snapshot
    expect({
      finalState,
      routeCount: solver.solvedRoutes.length,
      diagnostics: solver.getRipDiagnostics(),
    }).toMatchSnapshot()
  })

  it("should compare aggressive vs conservative on same graph", async () => {
    const { graph: g1, connections: c1 } = createRipCandidateGraph()
    const { graph: g2, connections: c2 } = createRipCandidateGraph()

    const aggressive = runSolverToCompletion(
      new HyperGraphPartialRipping({
        inputGraph: g1,
        inputConnections: c1,
        rippingEnabled: true,
        ripStrategy: "all",
        ripCost: 10,
      }),
    )

    const conservative = runSolverToCompletion(
      createPartialRippingSolver({
        inputGraph: g2,
        inputConnections: c2,
        preset: "conservative",
      }),
    )

    // Side-by-side visual snapshots for PR review
    await expect(visualizeSolver(aggressive)).toMatchGraphicsSvg(
      import.meta.path,
      { svgName: "comparison-aggressive" },
    )
    await expect(visualizeSolver(conservative)).toMatchGraphicsSvg(
      import.meta.path,
      { svgName: "comparison-conservative" },
    )

    // Summary comparison snapshot
    expect({
      aggressive: {
        solved: aggressive.solved,
        routeCount: aggressive.solvedRoutes.length,
        totalRips: aggressive.totalRipsPerformed,
        diagnostics: aggressive.getRipDiagnostics(),
      },
      conservative: {
        solved: conservative.solved,
        routeCount: conservative.solvedRoutes.length,
        totalRips: conservative.totalRipsPerformed,
        diagnostics: conservative.getRipDiagnostics(),
      },
    }).toMatchSnapshot()
  })
})
