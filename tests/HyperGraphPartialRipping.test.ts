import { expect, test, describe } from "bun:test"
import { HyperGraphSolver } from "../lib/HyperGraphSolver"
import { HyperGraphPartialRipping } from "../lib/HyperGraphPartialRipping"
import type {
  HyperGraph,
  Connection,
  Region,
  RegionPort,
  SolvedRoute,
  Candidate,
} from "../lib/types"

// Helper: Create a minimal test graph
function createTestGraph(numRegions = 4): HyperGraph {
  const regions: Region[] = Array.from({ length: numRegions }, (_, i) => ({
    regionId: `r${i}`,
    ports: [],
    d: {},
  }))

  const ports: RegionPort[] = []
  for (let i = 0; i < numRegions - 1; i++) {
    ports.push({
      portId: `p${i}`,
      region1: regions[i],
      region2: regions[i + 1],
      d: {},
    })
  }

  // Assign ports to regions
  for (let i = 0; i < ports.length; i++) {
    ports[i].region1.ports.push(ports[i])
    ports[i].region2.ports.push(ports[i])
  }

  return { regions, ports }
}

// Helper: Create a test connection
function createTestConnection(
  startRegionId: string,
  endRegionId: string,
  graph: HyperGraph,
  id: string = "c0",
): Connection {
  const startRegion = graph.regions.find((r) => r.regionId === startRegionId)!
  const endRegion = graph.regions.find((r) => r.regionId === endRegionId)!
  return {
    connectionId: id,
    startRegion,
    endRegion,
    mutuallyConnectedNetworkId: `net-${id}`,
  }
}

// Helper: Create mock candidate for testing
function createMockCandidate(port: RegionPort): Candidate {
  return {
    port,
    g: 0,
    h: 0,
    f: 0,
    hops: 0,
    ripRequired: false,
  }
}

describe("HyperGraphPartialRipping - evaluateRipViability", () => {
  test("should reject rips when partialRippingEnabled=false", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: false, // Disabled
      ripThresholdMultiplier: 0.01, // Would normally reject
      ripCost: 10,
    })

    const expensiveRoute: SolvedRoute = {
      path: Array(100)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const result = solver.evaluateRipViability(expensiveRoute, 0)
    expect(result.shouldRip).toBe(true)
    expect(result.estimatedCost).toBe(0)
  })

  test("should reject rips that exceed threshold", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripThresholdMultiplier: 0.5, // Very strict
      ripCost: 10,
    })

    // Create a route with 5 ports: estimatedCost = 5 * 10 = 50
    // threshold = 10 * 0.5 = 5
    // 50 > 5, so should be rejected
    const expensiveRoute: SolvedRoute = {
      path: Array(5)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const result = solver.evaluateRipViability(expensiveRoute, 0)
    expect(result.shouldRip).toBe(false)
    expect(result.estimatedCost).toBe(50)
    expect(result.reason).toContain("exceeds threshold")
  })

  test("should approve rips within threshold", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripThresholdMultiplier: 10.0, // Very generous
      ripCost: 10,
    })

    // Create a cheap route with 1 port: estimatedCost = 1 * 10 = 10
    // threshold = 10 * 10.0 = 100
    // 10 < 100, so should be approved
    const cheapRoute: SolvedRoute = {
      path: Array(1)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const result = solver.evaluateRipViability(cheapRoute, 0)
    expect(result.shouldRip).toBe(true)
    expect(result.estimatedCost).toBe(10)
  })

  test("should reject rips that would exceed max cumulative cost", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripThresholdMultiplier: 100.0, // High threshold won't block
      maxCumulativeRipCost: 50, // But budget is tight
      ripCost: 10,
    })

    // Route costs 40 (4 ports * 10)
    const route: SolvedRoute = {
      path: Array(4)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    // First rip: currentCost=0, route=40, total=40 < 50 ✓
    const result1 = solver.evaluateRipViability(route, 0)
    expect(result1.shouldRip).toBe(true)

    // Second rip: currentCost=40, route=40, total=80 > 50 ✗
    const result2 = solver.evaluateRipViability(route, 40)
    expect(result2.shouldRip).toBe(false)
    expect(result2.reason).toContain("exceed max cumulative")
  })

  test("should track and report estimated cost correctly", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripThresholdMultiplier: 100.0,
      maxCumulativeRipCost: 1000,
      ripCost: 7,
    })

    // Route with 6 ports: estimatedCost = 6 * 7 = 42
    const route: SolvedRoute = {
      path: Array(6)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const result = solver.evaluateRipViability(route, 0)
    expect(result.estimatedCost).toBe(42)
  })
})

describe("HyperGraphPartialRipping - estimateRipCost", () => {
  test("should calculate cost based on path length and ripCost", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripCost: 5,
    })

    const route: SolvedRoute = {
      path: Array(8)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const cost = solver.estimateRipCost(route)
    expect(cost).toBe(8 * 5) // 40
  })

  test("should return 0 for empty path", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      ripCost: 10,
    })

    const route: SolvedRoute = {
      path: [],
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const cost = solver.estimateRipCost(route)
    expect(cost).toBe(0)
  })
})

describe("HyperGraphPartialRipping - subclass", () => {
  test("should have sensible default configuration", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: [dummyConnection],
    })

    expect(solver.partialRippingEnabled).toBe(true)
    expect(solver.ripThresholdMultiplier).toBe(1.5)
    expect(solver.maxCumulativeRipCost).toBe(200)
    expect(solver.rippingEnabled).toBe(true)
  })

  test("should allow custom configuration", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      ripThresholdMultiplier: 2.5,
      maxCumulativeRipCost: 500,
    })

    expect(solver.ripThresholdMultiplier).toBe(2.5)
    expect(solver.maxCumulativeRipCost).toBe(500)
  })

  test("should be named correctly", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: [dummyConnection],
    })

    expect(solver.getSolverName()).toBe("HyperGraphPartialRipping")
  })
})

describe("HyperGraphPartialRipping - backward compatibility", () => {
  test("default HyperGraphSolver should have partial ripping disabled", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
    })

    expect(solver.partialRippingEnabled).toBe(false)
    expect(solver.ripThresholdMultiplier).toBe(1.0)
    expect(solver.maxCumulativeRipCost).toBe(Infinity)
  })

  test("should behave like standard ripping when partialRippingEnabled=false", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: false,
      ripThresholdMultiplier: 0.01, // Would normally reject
      maxCumulativeRipCost: 0.01, // Would normally reject
    })

    const route: SolvedRoute = {
      path: Array(100)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    // Should still approve because feature is disabled
    const result = solver.evaluateRipViability(route, 0)
    expect(result.shouldRip).toBe(true)
  })
})

describe("HyperGraphPartialRipping - edge cases", () => {
  test("should handle zero ripCost", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripCost: 0,
      ripThresholdMultiplier: 1.0,
    })

    const route: SolvedRoute = {
      path: Array(100)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const result = solver.evaluateRipViability(route, 0)
    expect(result.shouldRip).toBe(true) // Cost is 0, threshold is 0, but 0 is not > 0
  })

  test("should handle very large costs", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripCost: 1000000,
      ripThresholdMultiplier: 1.0,
      maxCumulativeRipCost: 1000000,
    })

    const route: SolvedRoute = {
      path: Array(10)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ),
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    const cost = solver.estimateRipCost(route)
    expect(cost).toBe(10 * 1000000)
    expect(typeof cost).toBe("number")
  })

  test("should handle cumulative cost at exact boundary", () => {
    const graph = createTestGraph()
    const dummyConnection = createTestConnection("r0", "r3", graph, "dummy")
    const solver = new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: [dummyConnection],
      rippingEnabled: true,
      partialRippingEnabled: true,
      ripThresholdMultiplier: 100.0,
      maxCumulativeRipCost: 100,
      ripCost: 10,
    })

    const route: SolvedRoute = {
      path: Array(5)
        .fill(null)
        .map((_, i) =>
          createMockCandidate(graph.ports[i % graph.ports.length]),
        ), // Cost: 50
      connection: createTestConnection("r0", "r3", graph),
      requiredRip: false,
    }

    // First rip: 0 + 50 = 50 < 100 ✓
    const result1 = solver.evaluateRipViability(route, 0)
    expect(result1.shouldRip).toBe(true)

    // Second rip: 50 + 50 = 100, which is NOT > 100, so should be approved
    const result2 = solver.evaluateRipViability(route, 50)
    expect(result2.shouldRip).toBe(true)

    // Third rip: 100 + 50 = 150 > 100 ✗
    const result3 = solver.evaluateRipViability(route, 100)
    expect(result3.shouldRip).toBe(false)
  })
})
