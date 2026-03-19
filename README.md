# @tscircuit/hypergraph

A generic A* pathfinding solver for routing connections through hypergraphs. Designed for circuit routing problems but extensible to any graph-based pathfinding scenario.

## Installation

```bash
npm install @tscircuit/hypergraph
```

## Overview

HyperGraphSolver implements an A* algorithm that routes connections through a hypergraph data structure where:

- **Regions** are nodes representing spaces in your problem domain
- **Ports** are edges connecting two regions (the boundary between them)
- **Connections** define start and end regions that need to be linked

The solver finds optimal paths through the graph while handling conflicts via "ripping" - the ability to reroute existing paths when they block new connections.

## Core Types

```typescript
interface Region {
  regionId: string
  ports: RegionPort[]
  d: any // Domain-specific data (e.g., bounds, coordinates)
  assignments?: RegionPortAssignment[]
}

interface RegionPort {
  portId: string
  region1: Region
  region2: Region
  d: any // Domain-specific data (e.g., x, y position)
  assignment?: PortAssignment
  ripCount?: number
}

interface Connection {
  connectionId: string
  mutuallyConnectedNetworkId: string
  startRegion: Region
  endRegion: Region
}

interface HyperGraph {
  regions: Region[]
  ports: RegionPort[]
}
```

## Basic Usage

```typescript
import { HyperGraphSolver } from "@tscircuit/hypergraph"

const solver = new HyperGraphSolver({
  inputGraph: {
    regions: [...],
    ports: [...],
  },
  inputConnections: [
    { connectionId: "c1", mutuallyConnectedNetworkId: "net1", startRegion: regionA, endRegion: regionB },
    { connectionId: "c2", mutuallyConnectedNetworkId: "net2", startRegion: regionC, endRegion: regionD },
  ],
})

solver.solve()

if (solver.solved) {
  console.log(solver.solvedRoutes)
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `inputGraph` | `HyperGraph \| SerializedHyperGraph` | required | The graph with regions and ports |
| `inputConnections` | `Connection[]` | required | Connections to route |
| `greedyMultiplier` | `number` | `1.0` | Weight for heuristic score (higher = greedier search) |
| `rippingEnabled` | `boolean` | `false` | Allow rerouting existing paths to resolve conflicts |
| `ripCost` | `number` | `0` | Additional cost penalty when ripping is required |

## Creating a Custom Solver

HyperGraphSolver is designed to be extended. Override these methods to customize behavior for your domain:

```typescript
import { HyperGraphSolver, Region, RegionPort, Candidate } from "@tscircuit/hypergraph"

class MyCustomSolver extends HyperGraphSolver<MyRegion, MyPort> {
  /**
   * Estimate cost from a port to the destination region.
   * Used for the A* heuristic.
   */
  estimateCostToEnd(port: MyPort): number {
    // Return estimated distance/cost to currentEndRegion
  }

  /**
   * Compute heuristic score for a candidate.
   * Default uses estimateCostToEnd().
   */
  computeH(candidate: Candidate<MyRegion, MyPort>): number {
    return this.estimateCostToEnd(candidate.port)
  }

  /**
   * Return penalty for using a port (e.g., if previously ripped).
   */
  getPortUsagePenalty(port: MyPort): number {
    return port.ripCount ?? 0
  }

  /**
   * Cost increase when routing through a region using two specific ports.
   * Useful for penalizing crossings or congestion.
   */
  computeIncreasedRegionCostIfPortsAreUsed(
    region: MyRegion,
    port1: MyPort,
    port2: MyPort
  ): number {
    return 0
  }

  /**
   * Detect assignments that conflict with using port1 and port2 together.
   * Return assignments that must be ripped.
   */
  getRipsRequiredForPortUsage(
    region: MyRegion,
    port1: MyPort,
    port2: MyPort
  ): RegionPortAssignment[] {
    return []
  }

  /**
   * Filter candidates entering a region to reduce redundant exploration.
   */
  selectCandidatesForEnteringRegion(
    candidates: Candidate<MyRegion, MyPort>[]
  ): Candidate<MyRegion, MyPort>[] {
    return candidates
  }

  /**
   * Hook called after each route is solved.
   */
  routeSolvedHook(solvedRoute: SolvedRoute): void {
    // Custom logic after route completion
  }
}
```

## Solver Output

After calling `solve()`, access results via:

```typescript
solver.solved         // boolean - true if all connections routed
solver.solvedRoutes   // SolvedRoute[] - array of solved paths
solver.iterations     // number - iterations used
solver.failed         // boolean - true if max iterations exceeded
```

Each `SolvedRoute` contains:

```typescript
interface SolvedRoute {
  connection: Connection      // The connection that was routed
  path: Candidate[]           // Sequence of candidates forming the path
  requiredRip: boolean        // Whether ripping was needed
}
```

## Serialized Input Format

For JSON serialization, use ID references instead of object references:

```typescript
interface SerializedHyperGraph {
  regions: Array<{
    regionId: string
    d: any
  }>
  ports: Array<{
    portId: string
    region1Id: string
    region2Id: string
    d: any
  }>
}

interface SerializedConnection {
  connectionId: string
  mutuallyConnectedNetworkId: string
  startRegionId: string
  endRegionId: string
}
```

The solver automatically converts serialized inputs to deserialized object references.

## Algorithm

HyperGraphSolver uses A* pathfinding:

1. Initialize candidate queue with all ports of the start region
2. Process candidates in priority order (lowest `f = g + h * greedyMultiplier`)
3. When reaching the destination, trace back through parent pointers
4. Handle conflicts by ripping (removing conflicting routes and re-queuing them)
5. Continue until all connections are routed or max iterations exceeded

## Example Implementation

For a complete real-world implementation, see [JumperGraphSolver](./lib/JumperGraphSolver/JumperGraphSolver.ts) which extends HyperGraphSolver for PCB resistor network routing.

## License

MIT
