import * as fs from "node:fs"
import * as path from "node:path"
import type {
  JumperSolverDatasetName,
  JumperSolverDatasetSample,
} from "./jumperSolverBenchmarkTypes"

const datasetPathByName: Record<JumperSolverDatasetName, string> = {
  dataset02: path.join(
    __dirname,
    "../../datasets/jumper-graph-solver/dataset02.json",
  ),
}

export const loadJumperSolverDataset = (
  datasetName: JumperSolverDatasetName,
): JumperSolverDatasetSample[] => {
  const datasetPath = datasetPathByName[datasetName]
  return JSON.parse(
    fs.readFileSync(datasetPath, "utf8"),
  ) as JumperSolverDatasetSample[]
}
