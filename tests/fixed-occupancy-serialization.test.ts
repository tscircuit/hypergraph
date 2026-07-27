import { expect, test } from "bun:test"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "lib/convertSerializedHyperGraphToHyperGraph"
import { pruneDeadEndPorts } from "lib/pruneDeadEndPorts"
import type { SerializedHyperGraph } from "lib/types"

const createGraph = (): SerializedHyperGraph => ({
  regions: [
    { regionId: "r0", pointIds: ["p01"], d: {} },
    { regionId: "r1", pointIds: ["p01", "p12"], d: {} },
    { regionId: "r2", pointIds: ["p12"], d: {} },
  ],
  ports: [
    {
      portId: "p01",
      region1Id: "r0",
      region2Id: "r1",
      d: { x: 0, y: 0 },
    },
    {
      portId: "p12",
      region1Id: "r1",
      region2Id: "r2",
      d: { x: 1, y: 0 },
    },
  ],
  fixedOccupancy: {
    portReservations: [
      { portId: "p01", networkId: "GND" },
      { portId: "p12", networkId: "GND" },
    ],
    segments: [
      {
        regionId: "r1",
        fromPortId: "p01",
        toPortId: "p12",
        networkId: "GND",
        geometry: {
          start: { x: 0.1, y: 0 },
          end: { x: 0.9, y: 0 },
        },
        d: { traceId: "trace-1" },
      },
    ],
  },
})

test("fixed occupancy survives serialized and hydrated graph conversion", () => {
  const input = createGraph()
  const hydrated = convertSerializedHyperGraphToHyperGraph(input)
  const roundTripped = convertHyperGraphToSerializedHyperGraph(hydrated)

  expect(hydrated.fixedOccupancy).toEqual(input.fixedOccupancy)
  expect(hydrated.fixedOccupancy).not.toBe(input.fixedOccupancy)
  expect(roundTripped.fixedOccupancy).toEqual(input.fixedOccupancy)
  expect(roundTripped.fixedOccupancy).not.toBe(hydrated.fixedOccupancy)
})

test("topology pruning removes occupancy that references removed entities", () => {
  const hydrated = convertSerializedHyperGraphToHyperGraph(createGraph())

  pruneDeadEndPorts(hydrated, ["p01"])

  expect(hydrated.fixedOccupancy).toEqual({
    portReservations: [{ portId: "p01", networkId: "GND" }],
    segments: [],
  })
})
