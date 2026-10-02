import * as THREE from 'three'
import { pathDistance, type PlanPath } from '../../world/terrain'
import type { Vec3 } from '../../game/types'

/**
 * The town, laid out from the map (1160 × 770 px) at 0.18 m a pixel, centred on the map's middle; north is -Z.
 * A river comes in at the south-west, runs up the west side as the west ditch, turns east across the north
 * under the stone bridge and ends short of the water tower. The manor stands on a hill in the south-east.
 */
export const TOWN_SCALE = 0.18
/** A point on the source map, in pixels, as metres in the world. */
export const mapPx = (x: number, y: number): [number, number] => [(x - 580) * TOWN_SCALE, (y - 400) * TOWN_SCALE]

export const TOWN = {
  bounds: { minX: -110, maxX: 110, minZ: -82, maxZ: 70 },
  /** The perimeter fence: a rounded rectangle with the north-road gate in its north side. */
  fence: { minX: -101, maxX: 101, minZ: -70, maxZ: 61, radius: 27, gate: { x: -47, half: 3.5 } },
  river: [[-100, 70], [-85, 47], [-86, 30], [-88, 10], [-89, -10], [-87, -27], [-79, -41], [-67, -50], [-52, -54],
    [-36, -54.5], [-20, -53], [-2, -52], [10, -51.5], [22, -50]] as PlanPath,
  riverHalfWidth: 3, bank: 1.6, riverDepth: 1.6, waterLevel: -0.65,
  bridge: { x: -2, z: -52, length: 12.5, width: 5 },
  hill: { x: 56, z: 33, plateau: 12.5, radius: 23, height: 4.5 },
  /** You come in from outside the fence behind the graveyard: through a gap cut in the fence, over the west ditch on a footbridge, and in by the graveyard's back gate. */
  spawn: [-106, 0.05, 23.4] as Vec3,
  lookAt: [-74, 1.6, 23.4] as Vec3,
  fenceCut: { z: 23.4, half: 2.4 },
  footbridge: { x: -86.7, z: 23.4, length: 14.5, width: 2.2 },
  graveyard: { minX: -74.7, maxX: -44.1, minZ: 10.8, maxZ: 36, gap: { minZ: 19.5, maxZ: 24.5 }, backGate: { minZ: 22, maxZ: 24.8 } },
  church: { x: -46, z: -10 },
  silo: { x: -33, z: -37 },
  waterTower: { x: 36, z: -58 },
  market: { x: -2, z: -14.5, radius: 9 },
  townHall: { x: -2, z: 9 },
  school: { x: 29, z: 2 },
  hotel: { x: 61, z: -1 },
  barn: { x: 38, z: -19 },
  manor: { x: 56, z: 33 },
  fuelDepot: { x: -25, z: 43 },
  detention: { x: 16, z: 44 },
  checkpoint: { x: -47, z: -70 },
  /** Outside the checkpoint gate, on the north road: get both prisoners here. */
  extraction: { center: [-47, 0, -76.5] as Vec3, radius: 6 },
} as const

const smooth = (t: number) => { const c = THREE.MathUtils.clamp(t, 0, 1); return c * c * (3 - 2 * c) }

/** The ground height anywhere in the town: flat, but for the river's channel and the manor's hill. */
export function townHeight(x: number, z: number) {
  const { riverHalfWidth: half, bank, riverDepth } = TOWN
  const { distance } = pathDistance(TOWN.river, x, z)
  const river = distance < half ? -riverDepth : distance < half + bank ? -riverDepth * (1 - smooth((distance - half) / bank)) : 0
  const { hill } = TOWN
  const r = Math.hypot(x - hill.x, z - hill.z)
  const rise = r <= hill.plateau ? hill.height : hill.height * (1 - smooth((r - hill.plateau) / (hill.radius - hill.plateau)))
  return river + rise
}

/** The roads, as the map's dashed lanes: from the market out to every quarter, and along the river's north bank. */
export const ROADS: { name: string; path: PlanPath; width: number }[] = [
  { name: 'Bridge road', path: [[-2, -45], [-2, -23.5]], width: 4 },
  { name: 'Town hall road', path: [[-2, -5.5], [-2, 1]], width: 4 },
  { name: 'Church road', path: [[-11, -13], [-24, -10], [-32, -4]], width: 3 },
  { name: 'Silo lane', path: [[-8.5, -20.5], [-18, -28], [-26, -31]], width: 3 },
  { name: 'Barn road', path: [[7, -15], [18, -13.5], [29, -10]], width: 3.5 },
  { name: 'School road', path: [[5.5, -9], [16, -4], [22, 7.5]], width: 3 },
  { name: 'North-east lane', path: [[4, -21], [14, -32], [26, -44], [32, -52]], width: 3 },
  { name: 'Graveyard lane', path: [[-8.5, -8], [-20, 3], [-33, 14], [-43, 22]], width: 3 },
  { name: 'Depot road', path: [[-8, 22], [-16, 30], [-22, 34]], width: 3 },
  { name: 'Detention lane', path: [[4, 22], [10, 30], [16, 36]], width: 3 },
  { name: 'East road', path: [[40, 2], [52, 6]], width: 3 },
  { name: 'Manor drive', path: [[46, 9], [44, 20], [47.5, 30]], width: 3 },
  { name: 'Orchard lane', path: [[47, -12], [55, -10], [70, -9]], width: 3 },
  { name: 'North bank road', path: [[-2, -58.5], [-20, -61], [-36, -62], [-47, -63], [-47, -82]], width: 4 },
  { name: 'Back path', path: [[-109, 23.4], [-94.5, 23.4]], width: 2 },
  { name: 'Graveyard back path', path: [[-79, 23.4], [-74.8, 23.4]], width: 2 },
  { name: 'Water tower track', path: [[0, -58.5], [16, -59], [30, -58]], width: 3 },
]

/** Whether a point is on the stone bridge or the footbridge, where the river can be crossed. */
export const onBridge = (x: number, z: number) =>
  Math.abs(x - TOWN.bridge.x) < TOWN.bridge.width / 2 + 0.2 && Math.abs(z - TOWN.bridge.z) < TOWN.bridge.length / 2
  || Math.abs(z - TOWN.footbridge.z) < TOWN.footbridge.width / 2 + 0.2 && Math.abs(x - TOWN.footbridge.x) < TOWN.footbridge.length / 2
