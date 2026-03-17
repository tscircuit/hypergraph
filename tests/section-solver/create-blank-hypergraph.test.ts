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

test("createBlankHyperGraph turns section endpoints into connection regions", async () => {
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
    sectionGraph.solvedRoutes,
    deserializedSectionGraph,
  )

  const deserializedBlankGraph =
    convertSerializedHyperGraphToHyperGraph(blankGraph)
  const deserializedBlankConnections =
    convertSerializedConnectionsToConnections(
      blankGraph.connections ?? [],
      deserializedBlankGraph,
    )

  const sectionSvg = getSvgFromGraphicsObject(
    visualizeJumperGraphWithSolvedRoutes({
      graph: asJumperGraph(deserializedSectionGraph),
      connections: [],
      solvedRoutes: deserializedSectionRoutes,
      title: "Section",
    }),
  )

  const blankGraphics = visualizeJumperGraph(
    asJumperGraph(deserializedBlankGraph),
  )
  blankGraphics.title = "Blank section"
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
    stackSvgsVertically([sectionSvg, blankSvg], {
      gap: 48,
      normalizeSize: false,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
