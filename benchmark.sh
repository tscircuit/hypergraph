#!/usr/bin/env bash
set -euo pipefail

ARG="${1:-}"

# For now, all arguments run the default benchmark.
# The argument can be used to select different benchmark scripts in the future.
bun run ./scripts/benchmarking-1206x4/run-benchmark-2x2-1206x4-both-orientations.ts | tee ./benchmark-result.txt
