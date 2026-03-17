import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"
import { visualizeJumperGraphWithSolvedRoutes } from "lib/JumperGraphSolver/visualizeJumperGraphSolver"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertSerializedConnectionsToConnections } from "lib/convertSerializedConnectionsToConnections"
import { convertSerializedHyperGraphToHyperGraph } from "lib/convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "lib/convertSerializedSolvedRoutesToSolvedRoutes"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "lib/convertSolvedRoutesToSerializedSolvedRoutes"
import { createBlankHyperGraph } from "lib/createBlankHyperGraph"
import { extractSectionOfHyperGraph } from "lib/extractSectionOfHyperGraph"
import { stackSvgsVertically } from "stack-svgs"
import {
  asJumperGraph,
  createSketchedHyperGraph,
} from "./sketch-section-graph.fixture"

test("section extraction pipeline keeps only routed leaf ports and produces a blank graph", async () => {
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
  const sectionPortIds = sectionGraph.ports.map((port) => port.portId)

  expect(sectionRegionIds).toEqual(expect.arrayContaining(["B", "D", "E"]))
  expect(sectionRegionIds).not.toContain("A")
  expect(sectionRegionIds).not.toContain("C")
  expect(sectionRegionIds).not.toContain("F")
  expect(sectionPortIds).toEqual(["p-ab", "p-bd", "p-de", "p-ef"])
  expect(sectionGraph.solvedRoutes).toHaveLength(1)
  expect(
    sectionGraph.solvedRoutes?.[0]!.path.map((candidate) => candidate.portId),
  ).toEqual(["p-ab", "p-bd", "p-de", "p-ef"])
  expect(sectionGraph.solvedRoutes?.[0]!.connection.startRegionId).toBe(
    "__section_boundary__p-ab",
  )
  expect(sectionGraph.solvedRoutes?.[0]!.connection.endRegionId).toBe(
    "__section_boundary__p-ef",
  )

  const blankGraph = createBlankHyperGraph(sectionGraph)
  const blankRegionIds = blankGraph.regions.map((region) => region.regionId)

  expect(blankRegionIds).toEqual(
    expect.arrayContaining([
      "B",
      "D",
      "E",
      "connection:route-main:start",
      "connection:route-main:end",
    ]),
  )
  expect(
    blankRegionIds.some((id) => id.startsWith("__section_boundary__")),
  ).toBe(false)
  expect(blankGraph.connections).toHaveLength(1)
  expect(blankGraph.connections?.[0]!.startRegionId).toBe(
    "connection:route-main:start",
  )
  expect(blankGraph.connections?.[0]!.endRegionId).toBe(
    "connection:route-main:end",
  )

  const deserializedSectionGraph =
    convertSerializedHyperGraphToHyperGraph(sectionGraph)
  const deserializedSectionRoutes = convertSerializedSolvedRoutesToSolvedRoutes(
    sectionGraph.solvedRoutes ?? [],
    deserializedSectionGraph,
  )

  const deserializedBlankGraph =
    convertSerializedHyperGraphToHyperGraph(blankGraph)
  const deserializedBlankConnections =
    convertSerializedConnectionsToConnections(
      blankGraph.connections ?? [],
      deserializedBlankGraph,
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
      title: "Extracted section",
    }),
  )

  const blankGraphics = visualizeJumperGraph(
    asJumperGraph(deserializedBlankGraph),
  )
  blankGraphics.title = "Blank graph"
  for (const connection of deserializedBlankConnections) {
    for (const region of [connection.startRegion, connection.endRegion]) {
      const bounds = region.d.bounds
      blankGraphics.rects.push({
        center: region.d.center,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
        fill: "rgba(255, 120, 120, 0.45)",
      })
    }
    blankGraphics.points.push({
      x: connection.startRegion.d.center.x,
      y: connection.startRegion.d.center.y,
      color: "rgba(255, 0, 0, 0.85)",
    })
    blankGraphics.points.push({
      x: connection.endRegion.d.center.x,
      y: connection.endRegion.d.center.y,
      color: "rgba(255, 0, 0, 0.85)",
    })
  }
  const blankSvg = getSvgFromGraphicsObject(blankGraphics)

  await expect(
    stackSvgsVertically([fullSvg, sectionSvg, blankSvg], {
      gap: 48,
      normalizeSize: false,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
