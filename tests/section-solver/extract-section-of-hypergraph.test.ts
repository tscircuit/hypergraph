import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { visualizeJumperGraphWithSolvedRoutes } from "lib/JumperGraphSolver/visualizeJumperGraphSolver"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "lib/convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "lib/convertSerializedSolvedRoutesToSolvedRoutes"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "lib/convertSolvedRoutesToSerializedSolvedRoutes"
import { extractSectionOfHyperGraph } from "lib/extractSectionOfHyperGraph"
import { stackSvgsVertically } from "stack-svgs"
import {
  asJumperGraph,
  createSketchedHyperGraph,
} from "./sketch-section-graph.fixture"

test("extractSectionOfHyperGraph returns the sketched mid-section", async () => {
  const { graph, solvedRoutes } = createSketchedHyperGraph()
  const serializedGraph = {
    ...convertHyperGraphToSerializedHyperGraph(graph),
    solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(solvedRoutes),
  }

  const sectionGraph = extractSectionOfHyperGraph({
    graph: serializedGraph,
    centralRegionId: "D",
    expansionHopsFromCentralRegion: 0,
  })

  const sectionRegionIds = sectionGraph.regions.map((region) => region.regionId)

  expect(sectionRegionIds).toEqual(expect.arrayContaining(["B", "D", "E"]))
  expect(sectionRegionIds).not.toContain("A")
  expect(sectionRegionIds).not.toContain("C")
  expect(sectionRegionIds).not.toContain("F")
  expect(sectionGraph.solvedRoutes).toHaveLength(1)
  expect(
    sectionGraph.solvedRoutes[0]!.path.map((candidate) => candidate.portId),
  ).toEqual(["p-ab", "p-bd", "p-de", "p-ef"])
  expect(sectionGraph.solvedRoutes[0]!.connection.startRegionId).toBe(
    "__section_boundary__p-ab",
  )
  expect(sectionGraph.solvedRoutes[0]!.connection.endRegionId).toBe(
    "__section_boundary__p-ef",
  )

  const deserializedSectionGraph =
    convertSerializedHyperGraphToHyperGraph(sectionGraph)
  const deserializedSectionRoutes = convertSerializedSolvedRoutesToSolvedRoutes(
    sectionGraph.solvedRoutes,
    deserializedSectionGraph,
  )

  const fullSvg = getSvgFromGraphicsObject(
    visualizeJumperGraphWithSolvedRoutes({
      graph: asJumperGraph(graph),
      connections: [],
      solvedRoutes,
      title: "Full graph",
    }),
  )

  const sectionSvg = getSvgFromGraphicsObject(
    visualizeJumperGraphWithSolvedRoutes({
      graph: asJumperGraph(deserializedSectionGraph),
      connections: [],
      solvedRoutes: deserializedSectionRoutes,
      title: "Section",
    }),
  )

  await expect(
    stackSvgsVertically([fullSvg, sectionSvg], {
      gap: 48,
      normalizeSize: false,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
