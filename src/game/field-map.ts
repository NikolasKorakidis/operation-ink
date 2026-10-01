import * as THREE from 'three'
import type { MissionWorld } from './types'

/** Where a field map puts the world: map x = (world x + originX) * scale + pad, map y likewise from z. */
export type MapProjection = { originX: number; originZ: number; scale: number; pad: number }
const WIDTH = 460, HEIGHT = 260, PAD = 14

/** The SVG's own attributes for its projection, which the HUD reads to place the player's arrow. */
export const projectionAttributes = ({ originX, originZ, scale, pad }: MapProjection) =>
  `data-origin-x="${originX}" data-origin-z="${originZ}" data-scale="${scale}" data-pad="${pad}"`

/** Read a field map's projection back from its SVG (see projectionAttributes). */
export function readProjection(svg: Element | null): MapProjection | null {
  const data = (svg as SVGElement | null)?.dataset
  if (!data?.scale) return null
  return { originX: Number(data.originX), originZ: Number(data.originZ), scale: Number(data.scale), pad: Number(data.pad) }
}

const escape = (text: string) => text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)

/**
 * A field map drawn from the level itself, for levels that bring no map of their own: the play area, every
 * building (anything with userData.footprint) hatched and named, the stations, the goal areas and the insertion
 * point, fitted to the map. North (-Z) is up.
 */
export function fieldMap(ground: THREE.Object3D, world: MissionWorld): string {
  ground.updateMatrixWorld(true)
  const { minX, maxX, minZ, maxZ } = world.bounds
  const scale = +Math.min((WIDTH - PAD * 2) / (maxX - minX), (HEIGHT - PAD * 2) / (maxZ - minZ)).toFixed(4)
  // Centred on the sheet: the spare width (or height) is shared either side.
  const spareX = (WIDTH - PAD * 2 - (maxX - minX) * scale) / 2, spareZ = (HEIGHT - PAD * 2 - (maxZ - minZ) * scale) / 2
  const projection: MapProjection = { originX: +(-minX + spareX / scale).toFixed(3), originZ: +(-minZ + spareZ / scale).toFixed(3), scale, pad: PAD }
  const x = (v: number) => +((v + projection.originX) * scale + PAD).toFixed(1), z = (v: number) => +((v + projection.originZ) * scale + PAD).toFixed(1)
  const buildings: string[] = [], names: string[] = []
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), size = new THREE.Vector3()
  ground.traverse(object => {
    const footprint = object.userData.footprint as [number, number] | undefined
    if (!footprint) return
    object.matrixWorld.decompose(position, quaternion, size)
    const yaw = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ').y
    const [w, d] = footprint
    const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([cx, cz]) => {
      const p = new THREE.Vector3(cx, 0, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(position)
      return `${x(p.x)},${z(p.z)}`
    })
    buildings.push(`<path d="M${corners.join(' L')}Z" fill="url(#map-hatching)" stroke="var(--ink-light)"/>`)
    if (object.name) names.push(`<text x="${x(position.x)}" y="${z(position.z) - (d * scale) / 2 - 3}" text-anchor="middle">${escape(object.name.split(' · ')[0])}</text>`)
  })
  const stations = world.stations.filter(station => station.kind === 'objective').map(station =>
    `<circle cx="${x(station.point.x)}" cy="${z(station.point.z)}" r="2.6" fill="var(--ink)"/><text x="${x(station.point.x) + 5}" y="${z(station.point.z) - 5}">${escape(station.label)}</text>`)
  const areas = (world.goals ?? []).flatMap(goal => goal.kind === 'reach' || goal.kind === 'extract' ? [goal] : []).map(goal =>
    `<circle cx="${x(goal.area.center[0])}" cy="${z(goal.area.center[2])}" r="${(goal.area.radius * scale).toFixed(1)}" fill="none" stroke="var(--ink)" stroke-dasharray="3 2"/><text x="${x(goal.area.center[0]) + goal.area.radius * scale + 4}" y="${z(goal.area.center[2]) + 3}">${escape(goal.label)}</text>`)
  const [sx, , sz] = world.spawn
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Field map, north is up" stroke-linecap="round" stroke-linejoin="round" ${projectionAttributes(projection)}>
    <defs><pattern id="map-hatching" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="var(--paper)"/><path d="M-1 6L6 -1M1 8L8 1" stroke="var(--ink-light)" stroke-width="0.5" opacity="0.5"/></pattern></defs>
    <path d="M6 6L454 5 455 254 5 255Z" fill="var(--paper)" stroke="var(--ink-rule)"/>
    <rect x="${x(minX)}" y="${z(minZ)}" width="${((maxX - minX) * scale).toFixed(1)}" height="${((maxZ - minZ) * scale).toFixed(1)}" fill="none" stroke="var(--ink-light)" stroke-dasharray="1 3"/>
    <path d="M18 32V15l-4 7m4-7 4 7" fill="none" stroke="var(--ink)"/><text x="16" y="45">N</text>
    ${buildings.join('')}${names.join('')}${areas.join('')}${stations.join('')}
    <path d="M${x(sx) - 4} ${z(sz)}h8M${x(sx)} ${z(sz) - 4}v8" stroke="var(--ink)" stroke-width="1.2"/><text x="${x(sx) + 6}" y="${z(sz) + 4}">Insertion</text>
    <path id="field-player" d="M0 -5 3.5 4 0 2 -3.5 4Z" fill="var(--ink-deep)" stroke="var(--paper)" stroke-width="1"/>
  </svg>`
}
