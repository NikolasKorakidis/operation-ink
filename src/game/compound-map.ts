import { SIGNALS_COMPUTER_ID } from './mission'
import type { Station } from './types'
import { projectionAttributes } from './field-map'

/** The compound's hand-drawn field map: its routes, buildings and the rescue's key stations. North is up. */
export function compoundMap(stations: Station[]) {
  const x = (v: number) => (v + 110) * 1.55 + 12, z = (v: number) => (v + 78) * 1.55 + 12
  const point = (a: number, b: number) => `${x(a)},${z(b)}`
  const buildings: [number, number, number, number][] = [[-34,-46,28,21],[25,-7,56,13],[16,36,20,14],[55,35,12,18],[-30,30,28,8],[83,-9,17,13],[117,-17,18,24],[146,-45,10,9],[143,3,14,10],[111,-45,12,10]]
  const stationNames: Record<string,string> = { cameras: 'Security', gate: 'Exit gate', jeep: 'Jeep', hostage: 'Cells', alarm: 'Alarm', rally: 'Regroup', supply: 'Supplies', distraction: 'Bell' }
  const buildingsInk = buildings.map(([bx,bz,w,d], i) => {
    const left = x(bx-w/2), top = z(bz-d/2), width = w*1.55, height = d*1.55
    return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#map-hatching)" stroke="var(--ink-light)"/>
      <path d="M${left-0.5} ${top+1}l${width+1} -0.6 -0.7 ${height-0.2}${i%2 ? '' : ` -${width-1} 0.5`}" fill="none" stroke="var(--ink)" stroke-width="0.55"/>`
  }).join('')
  return `<svg viewBox="0 0 460 260" ${projectionAttributes({ originX: 110, originZ: 78, scale: 1.55, pad: 12 })} role="img" aria-label="Field map: north is up. Rail route via water tower; service route via warehouse and workshop. East annex holds underground detention, security, jeep and exit gate." stroke-linecap="round" stroke-linejoin="round">
    <defs><pattern id="map-hatching" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="var(--paper)"/><path d="M-1 6L6 -1M1 8L8 1" stroke="var(--ink-light)" stroke-width="0.5" opacity="0.5"/></pattern></defs>
    <path d="M6 6L454 5 455 254 5 255Z M7 8L452 7" fill="var(--paper)" stroke="var(--ink-rule)"/>
    <path d="M18 32V15l-4 7m4-7 4 7" fill="none" stroke="var(--ink)"/><text x="16" y="45">N</text>
    <path d="M${point(26,-32)} L${point(165,-32)}" stroke="var(--ink-light)" stroke-width="3"/>
    <path d="M${point(-53,-51)} L${point(-48.665,-51)} L${point(-34,-51)} L${point(-34,-34)} L${point(-20,-29)} L${point(17,-28)} L${point(25,-34.2)} L${point(97,-34.2)} L${point(103,-34.2)} L${point(107,-35)} L${point(142,-35)}" stroke="var(--ink)" stroke-width="1.4" fill="none"/>
    <path d="M${point(-40,-62.3)} L${point(-53,-62.3)} L${point(-61.8,-52)} L${point(-61.8,-44)} L${point(-53,-44)} L${point(-50,-30)} L${point(-50,4)} L${point(-20,4)} L${point(-20,20.1)} L${point(-11.75,20.1)} L${point(-11.75,14)} L${point(0,13)} L${point(55,16)} L${point(99,11)} L${point(110,5)} L${point(117,-2)} L${point(117,-9)}" stroke="var(--ink)" stroke-dasharray="4 3" stroke-width="1.4" fill="none"/>
    ${buildingsInk}
    <text x="${x(-43)}" y="${z(-59)}">Mess hall</text><text x="${x(-92)}" y="${z(-50)}">Service gate</text><text x="${x(7)}" y="${z(5)}">Warehouse</text><text x="${x(64)}" y="${z(3)}">Workshop</text><text x="${x(132)}" y="${z(15)}">Barracks</text><text x="${x(108)}" y="${z(-18)}">Detention</text>
    ${stations.filter(s => ['cameras', 'gate', 'jeep'].includes(s.kind)).map(s => `<circle cx="${x(s.point.x)}" cy="${z(s.point.z)}" r="2.6" fill="var(--ink)"/><text text-anchor="${s.kind === 'gate' ? 'end' : 'start'}" x="${x(s.point.x)+(s.kind === 'gate' ? -5 : 5)}" y="${z(s.point.z)-5}">${s.id === SIGNALS_COMPUTER_ID ? 'Office terminal' : stationNames[s.kind]}</text>`).join('')}
    <path id="field-player" d="M0 -5 3.5 4 0 2 -3.5 4Z" fill="var(--ink-deep)" stroke="var(--paper)" stroke-width="1"/>
  </svg>`
}
