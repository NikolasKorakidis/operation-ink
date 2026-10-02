import * as THREE from 'three'

/** A hostage's body that shots and blasts can hit: the compound's hostage or a level's captive. */
export type HostageBody = { id: string; name: string; seated: boolean; actor: { root: THREE.Object3D; dead: boolean } }

/**
 * The body as a hit volume: an upright cylinder from his feet, 1.85 m standing or 1.3 m tied to a chair, a little
 * wider than the stick limbs so near misses at the torso count. Hits in the top `head` metres are head hits.
 */
const BODY = { radius: 0.27, standing: 1.85, seated: 1.3, head: 0.42 }

/**
 * The first hostage a ray strikes within `reach` (metres from `origin`; `direction` normalized), where, and whether
 * it is a head hit. Dead hostages are no longer targets.
 */
export function hostageAlong(bodies: readonly HostageBody[], origin: THREE.Vector3, direction: THREE.Vector3, reach: number) {
  let best: { body: HostageBody; distance: number; point: THREE.Vector3; head: boolean } | null = null
  for (const body of bodies) {
    if (body.actor.dead) continue
    const feet = body.actor.root.position, top = body.seated ? BODY.seated : BODY.standing
    // Where the ray meets the cylinder's side in plan, then whether that is within his height.
    const ox = origin.x - feet.x, oz = origin.z - feet.z
    const a = direction.x * direction.x + direction.z * direction.z
    const b = 2 * (ox * direction.x + oz * direction.z), c = ox * ox + oz * oz - BODY.radius * BODY.radius
    let t: number
    if (a < 1e-8) {
      // Straight up or down: a hit only when the ray starts within his footprint.
      if (c > 0) continue
      t = direction.y < 0 ? origin.y - (feet.y + top) : feet.y - origin.y
    } else {
      const disc = b * b - 4 * a * c
      if (disc < 0) continue
      const root = Math.sqrt(disc)
      t = (-b - root) / (2 * a)
      if (t < 0) t = (-b + root) / (2 * a)
    }
    if (!(t >= 0 && t <= reach) || (best && t >= best.distance)) continue
    const point = origin.clone().addScaledVector(direction, t), height = point.y - feet.y
    if (height < 0 || height > top) continue
    best = { body, distance: t, point, head: height > top - BODY.head }
  }
  return best
}

/** Hostages a blast at `center` reaches, with how far each is (to his chest). */
export function hostagesNear(bodies: readonly HostageBody[], center: THREE.Vector3, radius: number) {
  return bodies.filter(body => !body.actor.dead).map(body => {
    const chest = body.actor.root.position.clone().add(new THREE.Vector3(0, body.seated ? 0.8 : 1.2, 0))
    return { body, chest, distance: chest.distanceTo(center) }
  }).filter(entry => entry.distance < radius)
}
