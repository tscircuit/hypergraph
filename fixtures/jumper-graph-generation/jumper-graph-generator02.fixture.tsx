import { InteractiveGraphics } from "graphics-debug/react"
import { generateJumperGrid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperGrid"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

const jumperGridTopology = generateJumperGrid({
  cols: 3,
  rows: 2,
  marginX: 0.5,
  marginY: 0.5,
})

const graphics = visualizeJumperGraph({
  ports: jumperGridTopology.ports,
  regions: jumperGridTopology.regions,
})

export default () => <InteractiveGraphics graphics={graphics} />
