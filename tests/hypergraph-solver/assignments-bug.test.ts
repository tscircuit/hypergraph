import { expect, test } from "bun:test"
import { HyperGraphSolver } from "lib/HyperGraphSolver"
import type { Connection, HyperGraph, Region, RegionPort } from "lib/types"

test("region.assignments should be properly initialized even if undefined", () => {
  // Create a simple graph with 3 regions connected linearly
  // Note: NOT initializing assignments to test the bug
  const region1: Region = {
    regionId: "region1",
    ports: [],
    d: { center: { x: 0, y: 0 } },
  }

  const region2: Region = {
    regionId: "region2",
    ports: [],
    d: { center: { x: 1, y: 0 } },
  }

  const region3: Region = {
    regionId: "region3",
    ports: [],
    d: { center: { x: 2, y: 0 } },
  }

  const port1: RegionPort = {
    portId: "port1",
    region1: region1,
    region2: region2,
    d: {},
  }

  const port2: RegionPort = {
    portId: "port2",
    region1: region2,
    region2: region3,
    d: {},
  }

  region1.ports.push(port1)
  region2.ports.push(port1, port2)
  region3.ports.push(port2)

  const graph: HyperGraph = {
    regions: [region1, region2, region3],
    ports: [port1, port2],
  }

  const connection: Connection = {
    connectionId: "conn1",
    mutuallyConnectedNetworkId: "net1",
    startRegion: region1,
    endRegion: region3,
  }

  const solver = new HyperGraphSolver({
    inputGraph: graph,
    inputConnections: [connection],
  })

  solver.solve()

  // Check that assignments were created
  let totalAssignments = 0
  for (const region of graph.regions) {
    console.log(`Region ${region.regionId} assignments:`, region.assignments)
    if (region.assignments) {
      totalAssignments += region.assignments.length
    }
  }

  expect(totalAssignments).toBeGreaterThan(0)
  expect(region2.assignments).toBeDefined()
  expect(region2.assignments?.length).toBeGreaterThan(0)
})
