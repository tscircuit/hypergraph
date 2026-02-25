#!/usr/bin/env bun

import fs from "node:fs/promises"
import path from "node:path"
import type { ViaTile } from "../lib/ViaGraphSolver/ViaGraphSolver"

type Point = {
  x: number
  y: number
}

type Via = {
  viaId: string
  diameter: number
  position: Point
}

type RouteSegments = ViaTile["routeSegments"]

type RawSegment = {
  uuid: string
  start: Point
  end: Point
}

type GraphNode = {
  point: Point
  neighbors: Set<string>
}

const COORD_SCALE = 1_000_000
const POINT_MATCH_EPS = 1e-3

function normalizeCoord(value: number): number {
  return Math.round(value * COORD_SCALE) / COORD_SCALE
}

function pointKey(point: Point): string {
  return `${normalizeCoord(point.x)},${normalizeCoord(point.y)}`
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function sanitizeIdPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function parseNetTable(pcbText: string): Map<number, string> {
  const netById = new Map<number, string>()
  const netRe = /^\s*\(net\s+(\d+)\s+"([^"]*)"\)\s*$/gm
  let match: RegExpExecArray | null
  while ((match = netRe.exec(pcbText)) !== null) {
    netById.set(Number(match[1]), match[2])
  }
  return netById
}

function getBlocks(lines: string[], blockPrefix: string): string[] {
  const blocks: string[] = []
  let inBlock = false
  let depth = 0
  let current: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const opens = (line.match(/\(/g) || []).length
    const closes = (line.match(/\)/g) || []).length

    if (!inBlock && line.startsWith(blockPrefix)) {
      inBlock = true
      current = [line]
      depth = opens - closes
      if (depth <= 0) {
        blocks.push(current.join("\n"))
        inBlock = false
      }
      continue
    }

    if (inBlock) {
      current.push(line)
      depth += opens - closes
      if (depth <= 0) {
        blocks.push(current.join("\n"))
        inBlock = false
        current = []
      }
    }
  }

  return blocks
}

function parseVia(
  viaBlock: string,
  index: number,
  netById: Map<number, string>,
): { netName: string; via: Via } | null {
  const atMatch = viaBlock.match(/\(at\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)/)
  const sizeMatch = viaBlock.match(/\(size\s+([+-]?\d*\.?\d+)/)
  const netMatch = viaBlock.match(/\(net\s+(\d+)\)/)
  const uuidMatch = viaBlock.match(/\(uuid\s+"([^"]+)"\)/)

  if (!atMatch || !sizeMatch || !netMatch) return null

  const netId = Number(netMatch[1])
  const netName = netById.get(netId) ?? `net_${netId}`
  const viaId = uuidMatch ? uuidMatch[1] : `via_${index + 1}`

  return {
    netName,
    via: {
      viaId,
      diameter: Number(sizeMatch[1]),
      position: {
        x: Number(atMatch[1]),
        y: -Number(atMatch[2]),
      },
    },
  }
}

function parseSegment(
  segmentBlock: string,
  index: number,
  netById: Map<number, string>,
): { netName: string; segment: RawSegment } | null {
  const startMatch = segmentBlock.match(
    /\(start\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\)/,
  )
  const endMatch = segmentBlock.match(
    /\(end\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\)/,
  )
  const layerMatch = segmentBlock.match(/\(layer\s+"([^"]+)"\)/)
  const netMatch = segmentBlock.match(/\(net\s+(\d+)\)/)
  const uuidMatch = segmentBlock.match(/\(uuid\s+"([^"]+)"\)/)

  if (!startMatch || !endMatch || !layerMatch || !netMatch) return null
  if (layerMatch[1] !== "B.Cu") return null

  const netId = Number(netMatch[1])
  const netName = netById.get(netId) ?? `net_${netId}`
  const uuid = uuidMatch ? uuidMatch[1] : `segment_${index + 1}`

  return {
    netName,
    segment: {
      uuid,
      start: {
        x: Number(startMatch[1]),
        y: -Number(startMatch[2]),
      },
      end: {
        x: Number(endMatch[1]),
        y: -Number(endMatch[2]),
      },
    },
  }
}

function findMatchingNodeKey(
  graph: Map<string, GraphNode>,
  point: Point,
): string | null {
  const exact = pointKey(point)
  if (graph.has(exact)) return exact

  let best: { key: string; distance: number } | null = null
  for (const [key, node] of graph) {
    const d = pointDistance(node.point, point)
    if (d <= POINT_MATCH_EPS && (!best || d < best.distance)) {
      best = { key, distance: d }
    }
  }
  return best?.key ?? null
}

function buildGraph(segments: RawSegment[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>()

  const ensureNode = (point: Point): string => {
    const key = pointKey(point)
    if (!graph.has(key)) {
      graph.set(key, { point, neighbors: new Set<string>() })
    }
    return key
  }

  for (const segment of segments) {
    const startKey = ensureNode(segment.start)
    const endKey = ensureNode(segment.end)
    graph.get(startKey)!.neighbors.add(endKey)
    graph.get(endKey)!.neighbors.add(startKey)
  }

  return graph
}

function dijkstra(
  graph: Map<string, GraphNode>,
  start: string,
  allowedNodes: Set<string>,
): { dist: Map<string, number>; prev: Map<string, string | undefined> } {
  const dist = new Map<string, number>()
  const prev = new Map<string, string | undefined>()
  const unvisited = new Set<string>(allowedNodes)

  for (const key of allowedNodes) {
    dist.set(key, Infinity)
    prev.set(key, undefined)
  }
  dist.set(start, 0)

  while (unvisited.size > 0) {
    let current: string | null = null
    let bestDistance = Infinity

    for (const key of unvisited) {
      const candidateDistance = dist.get(key) ?? Infinity
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance
        current = key
      }
    }

    if (!current || bestDistance === Infinity) break
    unvisited.delete(current)

    const currentNode = graph.get(current)
    if (!currentNode) continue

    for (const neighbor of currentNode.neighbors) {
      if (!allowedNodes.has(neighbor) || !unvisited.has(neighbor)) continue
      const neighborNode = graph.get(neighbor)
      if (!neighborNode) continue

      const candidateDistance =
        bestDistance + pointDistance(currentNode.point, neighborNode.point)
      if (candidateDistance < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, candidateDistance)
        prev.set(neighbor, current)
      }
    }
  }

  return { dist, prev }
}

function reconstructPath(
  prev: Map<string, string | undefined>,
  start: string,
  end: string,
): string[] {
  const path: string[] = []
  let cursor: string | undefined = end

  while (cursor) {
    path.push(cursor)
    if (cursor === start) break
    cursor = prev.get(cursor)
  }

  if (path[path.length - 1] !== start) return []
  return path.reverse()
}

function buildConnectedComponent(
  graph: Map<string, GraphNode>,
  start: string,
  visited: Set<string>,
): Set<string> {
  const component = new Set<string>()
  const queue = [start]
  visited.add(start)

  while (queue.length > 0) {
    const current = queue.shift()!
    component.add(current)
    const node = graph.get(current)
    if (!node) continue

    for (const neighbor of node.neighbors) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }

  return component
}

class UnionFind {
  private parent = new Map<string, string>()

  constructor(keys: string[]) {
    for (const key of keys) this.parent.set(key, key)
  }

  find(key: string): string {
    const parent = this.parent.get(key)
    if (!parent) return key
    if (parent === key) return key
    const root = this.find(parent)
    this.parent.set(key, root)
    return root
  }

  union(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) this.parent.set(rootA, rootB)
  }
}

function buildRouteSegmentsForNet(
  netName: string,
  vias: Via[],
  segments: RawSegment[],
): RouteSegments {
  if (vias.length < 2 || segments.length === 0) return []

  const graph = buildGraph(segments)
  const viaByNodeKey = new Map<string, Via>()

  for (const via of vias) {
    const key = findMatchingNodeKey(graph, via.position)
    if (key) viaByNodeKey.set(key, via)
  }

  if (viaByNodeKey.size < 2) return []

  const allViaKeys = [...viaByNodeKey.keys()]
  const visitedNodes = new Set<string>()
  const routeSegments: RouteSegments = []
  let routeCounter = 0

  for (const viaKey of allViaKeys) {
    if (visitedNodes.has(viaKey)) continue

    const componentNodes = buildConnectedComponent(graph, viaKey, visitedNodes)
    const componentViaKeys = allViaKeys.filter((key) => componentNodes.has(key))
    if (componentViaKeys.length < 2) continue

    const candidateEdges: Array<{
      fromKey: string
      toKey: string
      distance: number
      path: string[]
    }> = []

    for (let i = 0; i < componentViaKeys.length; i++) {
      const fromKey = componentViaKeys[i]
      const { dist, prev } = dijkstra(graph, fromKey, componentNodes)

      for (let j = i + 1; j < componentViaKeys.length; j++) {
        const toKey = componentViaKeys[j]
        const distance = dist.get(toKey) ?? Infinity
        if (!Number.isFinite(distance)) continue
        const path = reconstructPath(prev, fromKey, toKey)
        if (path.length < 2) continue
        candidateEdges.push({ fromKey, toKey, distance, path })
      }
    }

    candidateEdges.sort((a, b) => a.distance - b.distance)
    const uf = new UnionFind(componentViaKeys)
    const neededEdges = componentViaKeys.length - 1
    let usedEdges = 0

    for (const edge of candidateEdges) {
      if (uf.find(edge.fromKey) === uf.find(edge.toKey)) continue
      uf.union(edge.fromKey, edge.toKey)

      const fromVia = viaByNodeKey.get(edge.fromKey)
      const toVia = viaByNodeKey.get(edge.toKey)
      if (!fromVia || !toVia) continue

      routeSegments.push({
        routeId: `${sanitizeIdPart(netName)}:route_${routeCounter++}`,
        fromPort: fromVia.viaId,
        toPort: toVia.viaId,
        layer: "bottom",
        segments: edge.path.map((nodeKey) => graph.get(nodeKey)!.point),
      })

      usedEdges += 1
      if (usedEdges >= neededEdges) break
    }
  }

  return routeSegments
}

async function main() {
  const inputPath = process.argv[2]
  const outputPath =
    process.argv[3] ?? path.join("assets", "ViaGraphSolver", "via-tile.json")

  if (!inputPath) {
    console.error(
      "Usage: bun scripts/parse-kicad-pcb-via-tile.ts <input.kicad_pcb> [output.json]",
    )
    process.exit(1)
  }

  const pcbText = await fs.readFile(inputPath, "utf8")
  const lines = pcbText.split(/\r?\n/)

  const netById = parseNetTable(pcbText)
  const viaBlocks = getBlocks(lines, "(via")
  const segmentBlocks = getBlocks(lines, "(segment")

  const viaTile: ViaTile = { viasByNet: {}, routeSegments: [] }
  const segmentsByNet = new Map<string, RawSegment[]>()

  for (let index = 0; index < viaBlocks.length; index++) {
    const viaBlock = viaBlocks[index]
    const parsed = parseVia(viaBlock, index, netById)
    if (!parsed) continue
    if (!viaTile.viasByNet[parsed.netName])
      viaTile.viasByNet[parsed.netName] = []
    viaTile.viasByNet[parsed.netName].push(parsed.via)
  }

  for (let index = 0; index < segmentBlocks.length; index++) {
    const segmentBlock = segmentBlocks[index]
    const parsed = parseSegment(segmentBlock, index, netById)
    if (!parsed) continue
    const netSegments = segmentsByNet.get(parsed.netName) ?? []
    netSegments.push(parsed.segment)
    segmentsByNet.set(parsed.netName, netSegments)
  }

  const routeSegments: RouteSegments = []
  for (const [netName, vias] of Object.entries(viaTile.viasByNet)) {
    const segments = segmentsByNet.get(netName) ?? []
    routeSegments.push(...buildRouteSegmentsForNet(netName, vias, segments))
  }
  viaTile.routeSegments = routeSegments

  await fs.mkdir(path.dirname(outputPath), { recursive: true }).catch(() => {})
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(viaTile, null, 2)}\n`,
    "utf8",
  )

  const totalViaCount = Object.values(viaTile.viasByNet).reduce(
    (sum, vias) => sum + vias.length,
    0,
  )
  console.log(
    `Saved ${totalViaCount} vias, ${routeSegments.length} route segments across ${Object.keys(viaTile.viasByNet).length} nets to ${outputPath}`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
