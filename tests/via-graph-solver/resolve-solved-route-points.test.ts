import { expect, test } from "bun:test"
import type { JPort, JRegion } from "lib/JumperGraphSolver/jumper-types"
import type { ViaTile } from "lib/ViaGraphSolver/ViaGraphSolver"
import {
  resolveSolvedRouteLineSegments,
  resolveSolvedRoutePoints,
} from "lib/ViaGraphSolver/resolveSolvedRoutePoints"
import type { Candidate, Connection, SolvedRoute } from "lib/types"

function createRegion(regionId: string, isViaRegion = false): JRegion {
  return {
    regionId,
    ports: [],
    d: {
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      center: { x: 0, y: 0 },
      polygon: [],
      isPad: false,
      isViaRegion,
    },
  }
}

function createPort(
  portId: string,
  region1: JRegion,
  region2: JRegion,
  x: number,
  y: number,
): JPort {
  const port: JPort = {
    portId,
    region1,
    region2,
    d: { x, y },
  }
  region1.ports.push(port)
  region2.ports.push(port)
  return port
}

function createSolvedRouteForViaTransition(): SolvedRoute {
  const startRegion = createRegion("conn:start")
  const viaRegion = createRegion("t0_0:v:NET_A", true)
  const endRegion = createRegion("conn:end")

  const entryPort = createPort("entry", startRegion, viaRegion, 0, 0)
  const exitPort = createPort("exit", viaRegion, endRegion, 10, 0)

  const firstCandidate: Candidate<JRegion, JPort> = {
    port: entryPort,
    g: 0,
    h: 0,
    f: 0,
    hops: 0,
    nextRegion: viaRegion,
    ripRequired: false,
  }

  const secondCandidate: Candidate<JRegion, JPort> = {
    port: exitPort,
    g: 0,
    h: 0,
    f: 0,
    hops: 1,
    parent: firstCandidate,
    lastPort: entryPort,
    lastRegion: viaRegion,
    nextRegion: endRegion,
    ripRequired: false,
  }

  const connection: Connection = {
    connectionId: "conn1",
    mutuallyConnectedNetworkId: "conn1",
    startRegion,
    endRegion,
  }

  return {
    path: [firstCandidate, secondCandidate],
    connection,
    requiredRip: false,
  }
}

test("resolveSolvedRoutePoints/LineSegments use top via stubs and tile-scoped bottom traces", () => {
  const solvedRoute = createSolvedRouteForViaTransition()

  const basicViaTile: ViaTile = {
    viasByNet: {
      NET_A: [
        { viaId: "v1", diameter: 0.6, position: { x: 1, y: 0 } },
        { viaId: "v2", diameter: 0.6, position: { x: 9, y: 0 } },
      ],
    },
    routeSegments: [
      {
        routeId: "r1",
        fromPort: "v1",
        toPort: "v2",
        layer: "bottom",
        segments: [
          { x: 1, y: 0 },
          { x: 5, y: 1 },
          { x: 9, y: 0 },
        ],
      },
    ],
  }

  expect(resolveSolvedRouteLineSegments(solvedRoute, basicViaTile)).toEqual([
    {
      layer: "top",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      layer: "bottom",
      points: [
        { x: 1, y: 0 },
        { x: 5, y: 1 },
        { x: 9, y: 0 },
      ],
    },
    {
      layer: "top",
      points: [
        { x: 9, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  ])

  expect(resolveSolvedRoutePoints(solvedRoute, basicViaTile)).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 5, y: 1 },
    { x: 9, y: 0 },
    { x: 10, y: 0 },
  ])

  const noBottomTile: ViaTile = {
    viasByNet: basicViaTile.viasByNet,
    routeSegments: [],
  }

  expect(resolveSolvedRouteLineSegments(solvedRoute, noBottomTile)).toEqual([
    {
      layer: "top",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      layer: "top",
      points: [
        { x: 9, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  ])

  const tileScopedViaTile: ViaTile = {
    viasByNet: {
      NET_A: [
        { viaId: "t0_0:v1", diameter: 0.6, position: { x: 1, y: 0 } },
        { viaId: "t0_0:v2", diameter: 0.6, position: { x: 9, y: 0 } },
        { viaId: "t0_1:v1", diameter: 0.6, position: { x: 101, y: 0 } },
        { viaId: "t0_1:v2", diameter: 0.6, position: { x: 109, y: 0 } },
      ],
    },
    routeSegments: [
      {
        routeId: "r-t0_0",
        fromPort: "t0_0:v1",
        toPort: "t0_0:v2",
        layer: "bottom",
        segments: [
          { x: 1, y: 0 },
          { x: 5, y: 1 },
          { x: 9, y: 0 },
        ],
      },
      {
        routeId: "r-t0_1",
        fromPort: "t0_1:v1",
        toPort: "t0_1:v2",
        layer: "bottom",
        segments: [
          { x: 101, y: 0 },
          { x: 105, y: 1 },
          { x: 109, y: 0 },
        ],
      },
    ],
  }

  expect(
    resolveSolvedRouteLineSegments(solvedRoute, tileScopedViaTile),
  ).toEqual([
    {
      layer: "top",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      layer: "bottom",
      points: [
        { x: 1, y: 0 },
        { x: 5, y: 1 },
        { x: 9, y: 0 },
      ],
    },
    {
      layer: "top",
      points: [
        { x: 9, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  ])
})
