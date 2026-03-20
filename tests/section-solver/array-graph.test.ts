import { expect, test } from "bun:test"
import {
  compileGraphArena,
  compileSolveState,
  extractSectionView,
  materializeSerializedGraphArena,
} from "lib/ArrayGraph"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "lib/convertSolvedRoutesToSerializedSolvedRoutes"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { createSketchedHyperGraph } from "./sketch-section-graph.fixture"

const toNames = (indices: Int32Array, names: string[]) =>
  Array.from(indices, (index) => names[index]!)

test("array graph compiles region adjacency and roundtrips topology", () => {
  const { graph, solvedRoutes } = createSketchedHyperGraph()
  const serializedGraph = {
    ...convertHyperGraphToSerializedHyperGraph(graph),
    solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(solvedRoutes),
  }

  const arena = compileGraphArena(serializedGraph)
  const roundTripped = materializeSerializedGraphArena(arena)

  expect(arena.regionCount).toBe(graph.regions.length)
  expect(arena.portCount).toBe(graph.ports.length)
  expect(arena.connectionCount).toBe(1)

  const regionDIndex = arena.regionIdToIndex.get("D")
  expect(regionDIndex).toBeDefined()
  expect(
    toNames(
      arena.regionPortIndex.slice(
        arena.regionPortStart[regionDIndex!]!,
        arena.regionPortStart[regionDIndex! + 1]!,
      ),
      arena.portIds,
    ),
  ).toEqual(["p-bd", "p-de", "p-d-bottom-left", "p-d-bottom-right"])

  expect(roundTripped.regions.map((region) => region.regionId)).toEqual(
    serializedGraph.regions.map((region) => region.regionId),
  )
  expect(roundTripped.ports.map((port) => port.portId)).toEqual(
    serializedGraph.ports.map((port) => port.portId),
  )
  expect(roundTripped.connections).toEqual([
    {
      connectionId: "route-main",
      startRegionId: "A",
      endRegionId: "F",
      mutuallyConnectedNetworkId: "route-main",
    },
  ])
})

test("array graph extracts the same section membership and route span", () => {
  const { graph, solvedRoutes } = createSketchedHyperGraph()
  const serializedGraph = {
    ...convertHyperGraphToSerializedHyperGraph(graph),
    solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(solvedRoutes),
  }

  const arena = compileGraphArena(serializedGraph)
  const state = compileSolveState(serializedGraph, arena)
  const sectionView = extractSectionView({
    arena,
    state,
    centralRegionId: "D",
    expansionHopsFromCentralRegion: 0,
  })

  expect(toNames(sectionView.regionIndices, arena.regionIds)).toEqual([
    "D",
    "B",
    "E",
    "boundary:d-bottom-left",
    "boundary:d-bottom-right",
  ])
  expect(toNames(sectionView.portIndices, arena.portIds)).toEqual([
    "p-ab",
    "p-bc",
    "p-bd",
    "p-ce",
    "p-de",
    "p-ef-upper",
    "p-ef",
    "p-d-bottom-left",
    "p-d-bottom-right",
    "p-e-bottom-left",
    "p-e-bottom-right",
  ])
  expect(toNames(sectionView.internalPortIndices, arena.portIds)).toEqual([
    "p-bd",
    "p-de",
    "p-d-bottom-left",
    "p-d-bottom-right",
  ])
  expect(toNames(sectionView.boundaryPortIndices, arena.portIds)).toEqual([
    "p-ab",
    "p-bc",
    "p-ce",
    "p-ef-upper",
    "p-ef",
    "p-e-bottom-left",
    "p-e-bottom-right",
  ])
  expect(toNames(sectionView.sectionConnections, arena.connectionIds)).toEqual([
    "route-main",
  ])
  expect(Array.from(sectionView.spanStart)).toEqual([1])
  expect(Array.from(sectionView.spanEnd)).toEqual([4])
  expect(toNames(sectionView.sectionRoutes, ["route-main"])).toEqual([
    "route-main",
  ])
})
