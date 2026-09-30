import assert from 'node:assert/strict'
import * as THREE from 'three'
import { NEON_MAX, NeonLights, neonUniforms } from '../src/render/neon'
import { NEON_GREEN } from '../src/render/neon-sign'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { addExitSigns } from '../src/world/exitSigns'
import { CollisionWorld } from '../src/player/collision'

const basic = THREE.ShaderLib.basic
assert(basic.vertexShader.includes('#include <neon_vertex>') && basic.fragmentShader.includes('#include <neon_fragment>\n#include <opaque_fragment>'),
  'Every basic material is shaded by neon light, just before its colour is written')
// Three clones a built-in material's uniforms; the light values must survive that as shared references.
const copy = THREE.UniformsUtils.clone(basic.uniforms)
for (const name of ['neonStart', 'neonEnd', 'neonFacing', 'neonColor', 'neonParams', 'neonShadow'] as const) {
  assert.equal(copy[name].value, neonUniforms[name].value, `${name} is shared by every material, not copied`)
}
assert.equal(neonUniforms.neonShadow.value.length, NEON_MAX)
console.log('PASS Neon lighting is patched into the shared basic shader, and every material reads the same light values')

const compound = createCompound()
const mission = createMissionWorld(compound)
prepareCompound(compound)
const scene = new THREE.Scene()
scene.add(compound, mission.root)
const exits = addExitSigns(scene)
scene.updateMatrixWorld(true)
const exitDoors: THREE.Object3D[] = []
scene.traverse(object => { if (object.userData.kind === 'door' && object.userData.exit) exitDoors.push(object) })
assert(exitDoors.length >= 20, 'Every building entrance, cabin door, the detention entrance and the gate are exits')
const buildingOf = (door: THREE.Object3D) => { let node = door.parent; while (node && !node.userData.footprint) node = node.parent; return node }
const signedDoors = exitDoors.filter(door => exits.some(sign => sign.name === `${door.name} · EXIT sign`))
for (const door of exitDoors) {
  const building = buildingOf(door)
  const ways = exitDoors.filter(other => buildingOf(other) === building).length
  const expected = !!(door.userData.exit.always || building?.userData.missionSite || (building && ways > 1))
  assert.equal(signedDoors.includes(door), expected, `${door.name}: ${expected ? 'signed' : 'no sign'} (${ways} way${ways > 1 ? 's' : ''} out)`)
}
for (const name of ['South barracks A · entry 1', 'Inner gatehouse · entry 1']) assert(!signedDoors.some(door => door.name === name), `${name}: a single-exit building has no EXIT sign`)
for (const name of ['Detention entrance', 'Secure compound exit gate', 'Security cabin · north door', 'Central long warehouse · entry 2'])
  assert(signedDoors.some(door => door.name === name), `${name} is signed`)
for (const door of signedDoors) {
  const sign = exits.find(candidate => candidate.name === `${door.name} · EXIT sign`)!
  assert(sign, `${door.name} has its EXIT sign`)
  assert.equal(sign.userData.neonLight.color, NEON_GREEN, 'Exit signs are green')
  const local = door.worldToLocal(sign.getWorldPosition(new THREE.Vector3()))
  assert(Math.abs(local.x) < 0.01 && local.y > door.userData.height && local.z < 0, `${door.name}: the sign is centred above the door, on its inside`)
  const out = new THREE.Vector3(0, 0, 1).transformDirection(sign.matrixWorld)
  const inward = new THREE.Vector3(0, 0, -1).transformDirection(door.matrixWorld)
  assert(out.dot(inward) > 0.99, `${door.name}: the sign faces into the room`)
}
console.log(`PASS ${exits.length} green neon EXIT signs: buildings with more than one way out, the hostage and camera sites, and the gate`)

const security = scene.getObjectByName('Neon sign · SECURITY')!
const tubes = security.getObjectByName('SECURITY neon tubes') as THREE.Mesh
tubes.geometry.computeBoundingBox()
const box = tubes.geometry.boundingBox!
const spec = security.userData.neonLight
assert(box.min.z > 0.08 && spec.standoff >= 0.1, 'The tubes stand off the wall on supports, not flat against it')
assert(box.max.z - box.min.z > 0.015 && box.max.x - box.min.x > 1.5, 'They are round glass tubes spelling the whole word')
assert(security.getObjectByName('SECURITY neon supports') && security.getObjectByName('SECURITY neon raceway'), 'Supports and a raceway hold them')
// The physical world ignores signs: nothing about them blocks movement or shots.
const world = new CollisionWorld(scene)
const facing = new THREE.Vector3(0, 0, 1).transformDirection(security.matrixWorld)
const inFront = new THREE.Vector3(...spec.start).lerp(new THREE.Vector3(...spec.end), 0.5).applyMatrix4(security.matrixWorld).addScaledVector(facing, 0.6)
assert(world.rayDistance(inFront, facing.clone().negate(), 1) > 0.6 + spec.standoff - 0.02, 'A ray toward the sign passes through it to the wall')
world.dispose()
console.log('PASS The SECURITY sign is 3D neon tube on standoffs and a raceway, and never blocks movement')

const lights = new NeonLights(scene)
assert.equal(lights.count, exits.length + 26, 'Every sign is a light; so are the screens, the cell lamps, the stairwell, the dark rooms\' doorways and the warehouse windows and doors')
// Just enough renderer for the cube shadow pass; it counts the faces drawn.
let faces = 0
const renderer = {
  initRenderTarget() {}, getClearAlpha: () => 1, getClearColor: (color: THREE.Color) => color, setClearColor() {},
  coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false },
  getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, setRenderTarget() {},
  render() { faces++ },
} as unknown as THREE.WebGLRenderer
const nearSecurity = new THREE.Vector3(-36, 1.6, -46.65)
lights.update(renderer, nearSecurity)
assert.equal(lights.active.length, NEON_MAX, 'Only the nearest signs are lit at once')
assert.equal(faces, 6, 'One light renders its six shadow faces per frame')
assert.equal(neonUniforms.neonParams.value[2], 1, 'and its shadows switch on once they exist')
assert.equal(lights.active[0], security, 'The nearest one is lit first')
const [intensity, range, , standoff] = neonUniforms.neonParams.value
assert(intensity > 0 && range >= 5 && Math.abs(standoff - spec.standoff) < 1e-6, 'It is a switched-on light with a real reach')
const start = new THREE.Vector3().fromArray(neonUniforms.neonStart.value), end = new THREE.Vector3().fromArray(neonUniforms.neonEnd.value)
const lightFacing = new THREE.Vector3().fromArray(neonUniforms.neonFacing.value)
// The signals office door is at x -41.6 in the mess hall; the hall is the +X side of that wall.
assert(start.x > -41.4 && Math.abs(start.x - end.x) < 1e-6, 'The tube line runs along the hall side of the office wall, off the wall')
assert(lightFacing.x > 0.99, 'The light shines into the hall, away from the camera room')
assert(start.y > 2.9 && Math.abs(start.z - end.z) > 1.5 && Math.abs((start.z + end.z) / 2 + 46.65) < 0.05, 'It hangs centred above the door, as wide as the word')
const gate = exits.find(sign => sign.name.startsWith('Secure compound exit gate'))!
lights.update(renderer, new THREE.Vector3(158, 1.6, 11))
assert(lights.active.includes(gate) && !lights.active.includes(security), 'Walking elsewhere hands the light slots to the signs nearby')
security.visible = false
lights.update(renderer, nearSecurity)
assert(!lights.active.includes(security), 'A hidden sign gives no light')
security.visible = true
lights.shadows = false
lights.update(renderer, nearSecurity)
assert(Array.from({ length: NEON_MAX }, (_, i) => neonUniforms.neonParams.value[i * 4 + 2]).every(value => value === 0), 'Shadows can be switched off')
console.log('PASS The nearest signs light the scene; SECURITY shines into the hall over the camera-room door')

{
  // The signals office is a dark room, lit only by its screen and by daylight through its door.
  const room = scene.getObjectByName('Signals office · darkness')!
  assert(room?.userData.darkRoom, 'The camera room is dark')
  const inside = (world: THREE.Vector3) => {
    const local = room.worldToLocal(world.clone())
    const half = room.userData.darkRoom.half as THREE.Vector3Tuple
    return Math.abs(local.x) < half[0] && Math.abs(local.y) < half[1] && Math.abs(local.z) < half[2]
  }
  const screen = scene.getObjectByName('Signals office · powered surveillance screen')!
  const door = scene.getObjectByName('Signals office door') as THREE.Group
  assert(inside(screen.getWorldPosition(new THREE.Vector3())), 'The screen is inside it')
  assert(inside(door.localToWorld(new THREE.Vector3(0, 1, -0.5))) && !inside(door.localToWorld(new THREE.Vector3(0, 1, 0.5))),
    'Its wall is the office partition: the office side is dark, the hall side is not')
  assert(!inside(security.getWorldPosition(new THREE.Vector3())), 'The SECURITY sign hangs outside it')
  const daylight = door.getObjectByName('Signals office door · daylight')!
  const doorLight = daylight.userData.neonLight
  const doors = await import('../src/world/doors')
  doors.setDoorOpen(door, false, true)
  assert.equal(doorLight.dimmer(), 0, 'No daylight comes in while the door is shut')
  doors.setDoorOpen(door, true, true, 1)
  assert.equal(doorLight.dimmer(), 1, 'It floods in with the door open')
  const daylightFacing = new THREE.Vector3(0, 0, 1).transformDirection(daylight.matrixWorld)
  assert(inside(daylight.getWorldPosition(new THREE.Vector3()).addScaledVector(daylightFacing, 1)), 'and shines into the office')
  doors.setDoorOpen(door, false, true)
  const office = new THREE.Vector3(-45.9, 1.6, -48)
  lights.shadows = true
  lights.update(renderer, office)
  assert(lights.active.includes(scene.getObjectByName('Signals office · surveillance · screen light')!), 'In the office the screen is one of the lights')
  assert(!lights.active.includes(daylight), 'A shut door gives no light, so it takes no light slot')
  const [half] = [neonUniforms.neonDarkHalf.value]
  assert(half[0] > 0 && half[1] > 0 && half[2] > 0, 'The shader knows where the dark room is')
}
console.log('PASS The camera room is dark: only its screen, and daylight through the open door, light it')

{
  // The central warehouse has no fittings: it is a dim hall lit by daylight through its windows and open doors.
  const warehouse = scene.getObjectByName('Central long warehouse')!
  const room = warehouse.getObjectByName('Central long warehouse · darkness')!
  const spec = room.userData.darkRoom
  assert(spec.ambient > 0.05 && spec.ambient < 0.3, 'Dim but readable, not black')
  assert(spec.pitch.slope > 0 && spec.pitch.ridge > spec.half[1], 'Its top follows the pitched roof up to the ridge')
  const windows: THREE.Object3D[] = [], doorways: THREE.Object3D[] = []
  warehouse.traverse(object => {
    if (/window · daylight$/.test(object.name)) windows.push(object)
    if (/entry \d · daylight$/.test(object.name)) doorways.push(object)
  })
  assert.equal(windows.length, 5, 'Three high back windows and one in each end wall')
  assert.equal(doorways.length, 3, 'and its three big doors')
  for (const window of windows) {
    const facing = new THREE.Vector3(0, 0, 1).transformDirection(window.matrixWorld)
    const ahead = room.worldToLocal(window.getWorldPosition(new THREE.Vector3()).addScaledVector(facing, 1))
    assert(Math.abs(ahead.x) < spec.half[0] - 0.5 && Math.abs(ahead.z) < spec.half[2] - 0.5, `${window.name} shines into the hall`)
  }
  for (const doorway of doorways) assert.equal(doorway.userData.neonLight.dimmer(), 0, 'No daylight through a shut door')
  let fittings = 0
  warehouse.traverse(object => { if (object.userData.neonLight && !/daylight|EXIT/.test(object.name)) fittings++ })
  assert.equal(fittings, 0, 'No light fittings inside')
}
console.log('PASS The central warehouse is lit only by daylight: five windows and its doors when open')

{
  // The cell block and the security cabin are dark rooms too.
  const insideRoom = (room: THREE.Object3D, world: THREE.Vector3) => {
    const local = room.worldToLocal(world.clone()), spec = room.userData.darkRoom
    const top = (spec.pitch?.ridge ?? spec.half[1]) - (spec.pitch?.slope ?? 0) * Math.abs(local.z)
    return Math.abs(local.x) < spec.half[0] && local.y > -spec.half[1] && local.y < top && Math.abs(local.z) < spec.half[2]
  }
  const cells = scene.getObjectByName('Detention cell block · darkness')!
  assert(cells && (cells.userData.darkRoom.ambient ?? 0.003) < 0.01, 'The cell block is dark')
  assert(insideRoom(cells, new THREE.Vector3(110.5, -3, -21)), 'The hostage cell is inside it')
  assert(!insideRoom(cells, new THREE.Vector3(117, 1.5, -12)), 'The guardroom upstairs is not')
  const cabin = scene.getObjectByName('Security cabin · darkness')!
  assert(cabin && insideRoom(cabin, scene.getObjectByName('Security cabin · surveillance screen')!.getWorldPosition(new THREE.Vector3())), 'The security cabin is dark around its monitor')
  for (const side of ['north', 'south']) assert(scene.getObjectByName(`Security cabin · ${side} door · daylight`), `Daylight comes through its ${side} door when open`)
  // The shader's cut-off: a surface is lit only while dot(p - start, facing) + standoff + 0.02 is not negative.
  const lit = (light: THREE.Object3D, world: THREE.Vector3) => {
    const spec = light.userData.neonLight
    const start = new THREE.Vector3(...spec.start).applyMatrix4(light.matrixWorld)
    const facing = new THREE.Vector3(0, 0, 1).transformDirection(light.matrixWorld)
    return world.clone().sub(start).dot(facing) + spec.standoff + 0.02 > 0
  }
  for (const name of ['Cell corridor north', 'Cell corridor south', 'Hostage cell']) {
    const lamp = scene.getObjectByName(`${name} · lamp light`)!
    const at = lamp.getWorldPosition(new THREE.Vector3())
    assert(lit(lamp, new THREE.Vector3(at.x, -4.2, at.z)) && lit(lamp, new THREE.Vector3(at.x, 0, at.z)), `${name}: lights the floor and the ceiling above it`)
    assert(!lit(lamp, new THREE.Vector3(at.x, 0.12, at.z)) && !lit(lamp, new THREE.Vector3(117, 0.12, -14)), `${name}: never the floor upstairs, even through the stairwell`)
  }
  assert(scene.getObjectByName('Detention stairwell · daylight'), 'Daylight falls down the stairwell')
}
console.log('PASS The cell block and security cabin are dark; the lamps stop at the ceiling and never light the floor above')

{
  // The Southwest stores, the other two-door warehouse, is daylight-only too.
  const stores = scene.getObjectByName('Southwest stores')!
  assert(stores.getObjectByName('Southwest stores · darkness')?.userData.darkRoom, 'The Southwest stores are dark inside')
  let windows = 0, doors = 0
  stores.traverse(object => { if (/window · daylight$/.test(object.name)) windows++; if (/entry \d · daylight$/.test(object.name)) doors++ })
  assert.equal(windows, 4, 'Two high back windows and one in each end wall'); assert.equal(doors, 2, 'and its two doors')
  // The detention block is furnished, with an amber lamp over each side of the cell block.
  const detention = scene.getObjectByName('Detention block and underground cells')!
  const furniture = (name: string) => { let n = 0; detention.getObjectByName(name)!.traverse(object => { if (object.userData.furniture) n++ }); return n }
  assert(furniture('Detention guardroom') >= 12 && furniture('Detention cell block') >= 10, 'The guardroom and the cell block are furnished')
  for (const name of ['Interrogation table · lamp light', 'Cell block stores · lamp light']) assert(scene.getObjectByName(name), `${name} lights the new furniture`)
}
console.log('PASS The Southwest stores are daylight-only; the detention guardroom and cell block are furnished and lit')

