import fs from "node:fs"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { generateViaTopologyRegions } from "lib/ViaGraphSolver/via-graph-generator/generateViaTopologyRegions"
import { visualizeJumperGraph } from "../lib/JumperGraphSolver/visualizeJumperGraph"
import viaTile from "assets/ViaGraphSolver/via-tile.json"

const topology = generateViaTopologyRegions(viaTile, {
  graphSize: 5,
  idPrefix: "via",
})

// Assign a distinct color to each net
const netNames = Object.keys(viaTile.viasByNet)
const netColors: Record<string, string> = {}
const colorPalette = [
  "rgba(231, 76, 60, 0.35)", // red
  "rgba(46, 204, 113, 0.35)", // green
  "rgba(52, 152, 219, 0.35)", // blue
  "rgba(243, 156, 18, 0.35)", // orange
  "rgba(155, 89, 182, 0.35)", // purple
  "rgba(26, 188, 156, 0.35)", // teal
  "rgba(241, 196, 15, 0.35)", // yellow
  "rgba(230, 126, 34, 0.35)", // dark orange
]
for (let i = 0; i < netNames.length; i++) {
  netColors[netNames[i]] = colorPalette[i % colorPalette.length]
}

const graphics = visualizeJumperGraph({
  ports: topology.ports,
  regions: topology.regions,
})

// Override polygon fills for per-net regions with distinct colors
for (let i = 0; i < topology.regions.length; i++) {
  const regionId = topology.regions[i].regionId
  // Net regions have IDs like "via:Net6"
  const netName = regionId.replace(
    `${topology.regions[0].regionId.split(":")[0]}:`,
    "",
  )
  if (netName in netColors && graphics.polygons) {
    graphics.polygons[i].fill = netColors[netName]
  }
}

// Overlay via circles with matching net colors
for (const [netName, vias] of Object.entries(viaTile.viasByNet)) {
  for (const via of vias) {
    graphics.circles!.push({
      center: via.position,
      radius: via.diameter / 2,
      fill: netColors[netName].replace("0.35", "0.5"),
      label: netName,
    })
  }
}

const outputPath = "assets/ViaGraphSolver/via-topology.svg"
fs.writeFileSync(outputPath, getSvgFromGraphicsObject(graphics))
console.log(`Written ${outputPath}`)
