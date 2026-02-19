import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { createGraphWithConnectionsFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"

test(
  "jumper-graph-solver02: solve 1x1 X4 grid with 5 external connections",
  // @ts-expect-error bun:test types don't include timeout option
  { timeout: 30000 },
  () => {
    const baseGraph = generateJumperX4Grid({
      cols: 1,
      rows: 1,
      marginX: 0.5,
      marginY: 0.5,
      outerPaddingX: 0.8,
      outerPaddingY: 0.8,
      regionsBetweenPads: true,
    })

    const graphWithConnections = createGraphWithConnectionsFromBaseGraph(
      baseGraph,
      [
        {
          start: { x: -2.55, y: 1.0 },
          end: { x: 2.55, y: -1.0 },
          connectionId: "A",
        },
        {
          start: { x: 0, y: 2.955 },
          end: { x: -2.55, y: -1.0 },
          connectionId: "B",
        },
        {
          start: { x: 0, y: -2.955 },
          end: { x: 2.55, y: 1.0 },
          connectionId: "C",
        },
        {
          start: { x: 2.55, y: -1.0 },
          end: { x: 0, y: 2.955 },
          connectionId: "D",
        },
        {
          connectionId: "E",
          start: { x: -2.55, y: -2.955 },
          end: { x: 2.55, y: 2.955 },
        },
      ],
    )

    const solver = new JumperGraphSolver({
      inputGraph: {
        regions: graphWithConnections.regions,
        ports: graphWithConnections.ports,
      },
      inputConnections: graphWithConnections.connections,
    })

    solver.solve()

    for (const region of graphWithConnections.regions) {
      if (!region.d.isThroughJumper) continue
      const networkIds = new Set(
        (region.assignments ?? []).map(
          (a) => a.connection.mutuallyConnectedNetworkId,
        ),
      )
      expect(networkIds.size).toBeLessThanOrEqual(1)
    }

    expect(getSvgFromGraphicsObject(solver.visualize())).toMatchSvgSnapshot(
      import.meta.path,
    )
  },
)
