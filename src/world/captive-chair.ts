import { Draft } from '../render/ink'
import type { Vec3 } from '../game/types'

/**
 * The chair a captive is tied to, shaped for his seated pose (the compound's hostage chair): a low seat 0.3 m up,
 * set just behind where he stands (his hips sit back over it), its back behind that. `facing` is the way he faces.
 * It never collides, so he can stand up out of it and walk away.
 */
export function captiveChair(name: string, position: Vec3, facing: number) {
  const chair = new Draft(name, position[0], position[2], facing)
  chair.position.y = position[1]
  chair.userData.noCollision = true
  chair.userData.kind = 'captive-chair'
  chair.box(0.48, 0.065, 0.46, 0, 0.3, -0.371, 'concrete', 'detail')
  for (const x of [-0.205, 0.205]) for (const z of [-0.56, -0.18]) chair.beam([x, 0.025, z], [x, 0.3, z], 0.045, 'roof', 'detail')
  for (const x of [-0.205, 0.205]) chair.beam([x, 0.31, -0.56], [x, 0.92, -0.59], 0.04, 'roof', 'detail')
  chair.box(0.47, 0.25, 0.05, 0, 0.78, -0.58, 'concrete', 'detail')
  // Rope round the chair back where his wrists are tied.
  chair.line([[-0.24, 0.62, -0.61], [0.24, 0.6, -0.61], [0.22, 0.66, -0.55], [-0.22, 0.68, -0.55]], 'detail')
  return chair.finish()
}
