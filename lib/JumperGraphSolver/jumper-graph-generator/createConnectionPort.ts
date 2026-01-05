import type { JPort, JRegion } from "../jumper-types"

export const createConnectionPort = (
  portId: string,
  connectionRegion: JRegion,
  boundaryRegion: JRegion,
  portPosition: { x: number; y: number },
): JPort => {
  const port: JPort = {
    portId,
    region1: connectionRegion,
    region2: boundaryRegion,
    d: { x: portPosition.x, y: portPosition.y },
  }
  connectionRegion.ports.push(port)
  boundaryRegion.ports.push(port)
  return port
}
