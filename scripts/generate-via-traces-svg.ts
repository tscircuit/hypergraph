#!/usr/bin/env bun

import fs from "node:fs/promises"
import path from "node:path"
import type { ViaTile } from "../lib/ViaGraphSolver/ViaGraphSolver"

const DEFAULT_INPUT_PATH = path.join(
  "assets",
  "ViaGraphSolver",
  "via-tile.json",
)
const DEFAULT_OUTPUT_PATH = path.join(
  "assets",
  "ViaGraphSolver",
  "via-traces.svg",
)

const TRACE_WIDTH = 0.15
const PADDING = 0.4
const PX_PER_UNIT = 220
// KiCad-like B.Cu color (classic blue tone).
const TRACE_COLOR = "#4d7fc4"
const NET_COLORS = [
  "#e74c3c",
  "#2ecc71",
  "#f1c40f",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#e84393",
  "#16a085",
]
const VIA_HOLE = "#ffffff"

type Point = { x: number; y: number }

function toFixed(value: number): string {
  return Number(value.toFixed(6)).toString()
}

function toPolylinePoints(
  points: Point[],
  sx: (x: number) => number,
  sy: (y: number) => number,
): string {
  return points.map((p) => `${toFixed(sx(p.x))},${toFixed(sy(p.y))}`).join(" ")
}

function toRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "")
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${1})`
}

async function main() {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT_PATH
  const outputPath = process.argv[3] ?? DEFAULT_OUTPUT_PATH

  const viaTile: ViaTile = JSON.parse(await fs.readFile(inputPath, "utf8"))
  const traces = viaTile.routeSegments.filter(
    (route) => route.segments && route.segments.length >= 2,
  )
  const vias = Object.values(viaTile.viasByNet).flat()
  const netNames = Object.keys(viaTile.viasByNet).sort()
  const netColorByName = new Map<string, string>()
  const netByViaId = new Map<string, string>()

  for (let i = 0; i < netNames.length; i++) {
    netColorByName.set(netNames[i], NET_COLORS[i % NET_COLORS.length])
  }
  for (const [netName, netVias] of Object.entries(viaTile.viasByNet)) {
    for (const via of netVias) {
      netByViaId.set(via.viaId, netName)
    }
  }

  const allTracePoints = traces.flatMap((route) => route.segments)
  const allPoints = [...allTracePoints, ...vias.map((via) => via.position)]
  if (allPoints.length === 0) {
    throw new Error("No traces or vias found in input file")
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const point of allPoints) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  // Include via radius and stroke half-width in viewport bounds.
  for (const via of vias) {
    const radius = via.diameter / 2
    minX = Math.min(minX, via.position.x - radius)
    maxX = Math.max(maxX, via.position.x + radius)
    minY = Math.min(minY, via.position.y - radius)
    maxY = Math.max(maxY, via.position.y + radius)
  }

  minX -= TRACE_WIDTH / 2
  maxX += TRACE_WIDTH / 2
  minY -= TRACE_WIDTH / 2
  maxY += TRACE_WIDTH / 2

  const viewWidth = maxX - minX + PADDING * 2
  const viewHeight = maxY - minY + PADDING * 2
  const pixelWidth = Math.max(400, Math.round(viewWidth * PX_PER_UNIT))
  const pixelHeight = Math.max(400, Math.round(viewHeight * PX_PER_UNIT))

  const sx = (x: number) => x - minX + PADDING
  // Flip Y so positive Y is up in board coordinates.
  const sy = (y: number) => maxY - y + PADDING

  const traceSvg = traces
    .map(
      (route) =>
        `<polyline points="${toPolylinePoints(route.segments, sx, sy)}" fill="none" stroke="${TRACE_COLOR}" stroke-width="${toFixed(TRACE_WIDTH)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("\n")

  const viaSvg = vias
    .map((via) => {
      const viaNetName = netByViaId.get(via.viaId) ?? "unknown"
      const netColor = netColorByName.get(viaNetName) ?? "#7f8c8d"
      const viaFill = toRgba(netColor, 0.45)
      const viaStroke = netColor
      const cx = toFixed(sx(via.position.x))
      const cy = toFixed(sy(via.position.y))
      const r = toFixed(via.diameter / 2)
      const holeR = toFixed(Math.max(0.05, via.diameter * 0.2))
      return [
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${viaFill}" stroke="${viaStroke}" stroke-width="${toFixed(TRACE_WIDTH / 2)}"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${holeR}" fill="${VIA_HOLE}"/>`,
      ].join("\n")
    })
    .join("\n")

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${toFixed(viewWidth)} ${toFixed(viewHeight)}">`,
    `<rect x="0" y="0" width="${toFixed(viewWidth)}" height="${toFixed(viewHeight)}" fill="white"/>`,
    traceSvg,
    viaSvg,
    `</svg>`,
  ].join("\n")

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${svg}\n`, "utf8")

  console.log(
    `Saved ${traces.length} traces and ${vias.length} vias to ${outputPath} (trace width ${TRACE_WIDTH})`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
