import type { FixedOccupancy, PortId, RegionId } from "./types"

export const cloneFixedOccupancy = (
  fixedOccupancy: FixedOccupancy | undefined,
): FixedOccupancy | undefined =>
  fixedOccupancy === undefined ? undefined : structuredClone(fixedOccupancy)

export const filterFixedOccupancy = (
  fixedOccupancy: FixedOccupancy | undefined,
  retainedRegionIds: ReadonlySet<RegionId>,
  retainedPortIds: ReadonlySet<PortId>,
): FixedOccupancy | undefined => {
  if (!fixedOccupancy) return undefined

  return {
    portReservations: (fixedOccupancy.portReservations ?? [])
      .filter(({ portId }) => retainedPortIds.has(portId))
      .map((reservation) => structuredClone(reservation)),
    segments: (fixedOccupancy.segments ?? [])
      .filter(
        ({ regionId, fromPortId, toPortId }) =>
          retainedRegionIds.has(regionId) &&
          retainedPortIds.has(fromPortId) &&
          retainedPortIds.has(toPortId),
      )
      .map((segment) => structuredClone(segment)),
  }
}
