import { describe, it, expect } from "bun:test"
import { HyperGraphPartialRipping, createPartialRippingSolver } from "../../lib/HyperGraphPartialRipping"
import type { HyperGraph, Connection, SolvedRoute, Region, RegionPort } from "../../lib/types"

/**
 * Helper to create a simple test graph
 *
 * Graph structure:
 *   R1 --p1-- R2 --p2-- R3
 *       --p3-- R4 --p4--
 *
 * This creates a graph where routes can potentially conflict
 */
function createTestGraph(): { graph: HyperGraph; connections: Connection[] } {
  const r1: Region = { regionId: "r1", ports: [], d: {} }
  const r2: Region = { regionId: "r2", ports: [], d: {} }
  const r3: Region = { regionId: "r3", ports: [], d: {} }
  const r4: Region = { regionId: "r4", ports: [], d: {} }

  const p1: RegionPort = { portId: "p1", region1: r1, region2: r2, d: {} }
  const p2: RegionPort = { portId: "p2", region1: r2, region2: r3, d: {} }
  const p3: RegionPort = { portId: "p3", region1: r1, region2: r4, d: {} }
  const p4: RegionPort = { portId: "p4", region1: r4, region2: r3, d: {} }
  // Add a crossing port that connects r2 to r4
  const p5: RegionPort = { portId: "p5", region1: r2, region2: r4, d: {} }

  r1.ports = [p1, p3]
  r2.ports = [p1, p2, p5]
  r3.ports = [p2, p4]
  r4.ports = [p3, p4, p5]

  const graph: HyperGraph = {
    ports: [p1, p2, p3, p4, p5],
    regions: [r1, r2, r3, r4],
  }

  // Create two connections that might need to share ports
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

      // Create mock solved routes
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
        ripCostThreshold: 50, // Low threshold to trigger
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
        ripCostThreshold: 100, // High threshold
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
        ripCostThreshold: 25, // Allow only ~2 ports worth of ripping
      })

      // Route with 1 port (cost = 10)
      const cheapRoute: SolvedRoute = {
        path: [{ port: graph.ports[0] }] as any,
        connection: connections[0],
        requiredRip: false,
      }

      // Route with 3 ports (cost = 30)
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

      // Should only include the cheap route
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

      expect(solver.calculateRipCost(route)).toBe(45) // 3 ports * 15 ripCost
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

      const diagnostics = solver.getRipDiagnostics()

      expect(diagnostics).toEqual({
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
        ripCostThreshold: 200, // Override preset value
      })

      expect(solver.ripCostThreshold).toBe(200)
      expect(solver.maxRoutesToRip).toBe(2) // From preset
    })
  })
})

describe("Integration: HyperGraphPartialRipping solving", () => {
  it("should solve simple graph without ripping", () => {
    // Create a simple graph where no ripping is needed
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

    // Run solver
    while (!solver.solved && !solver.failed) {
      solver.step()
    }

    expect(solver.solved).toBe(true)
    expect(solver.solvedRoutes.length).toBe(1)
    expect(solver.totalRipsPerformed).toBe(0)
  })
})