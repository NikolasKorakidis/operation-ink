import * as THREE from 'three'

/**
 * Compile every material in the scene now, behind the loading screen, instead of the first time each comes into
 * view: otherwise a guard, his gun or the first blood stalls one frame of play for 20–30 ms while its shader
 * compiles. Hidden objects (held guards, the flying hammer, effects not yet shown) are shown just for the compile.
 */
export function warmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const hidden: THREE.Object3D[] = []
  scene.traverse(object => { if (!object.visible) { hidden.push(object); object.visible = true } })
  try { renderer.compile(scene, camera) }
  finally { for (const object of hidden) object.visible = false }
}
