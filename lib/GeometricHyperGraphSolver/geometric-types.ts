import type { HyperGraph, Region, RegionPort } from "../types"

export type GeometricBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type GeometricPoint = {
  x: number
  y: number
}

export interface GeometricRegion extends Region {
  d: {
    bounds: GeometricBounds
    center: GeometricPoint
    polygon?: GeometricPoint[]
    polygonPerimeterCache?: {
      edgeLengths: number[]
      cumulative: number[]
      perimeter: number
    }
    [key: string]: unknown
  }
}

export interface GeometricPort extends RegionPort {
  region1T?: number
  region2T?: number
  d: GeometricPoint & {
    [key: string]: unknown
  }
}

export type GeometricHyperGraph = HyperGraph & {
  regions: GeometricRegion[]
  ports: GeometricPort[]
}
