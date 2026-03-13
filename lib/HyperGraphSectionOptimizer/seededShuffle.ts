import { createSeededRandom } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"

/** Deterministically shuffles a list using the provided seed. */
export const seededShuffle = <T>(items: T[], seed: number): T[] => {
  const random = createSeededRandom(seed)
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}
