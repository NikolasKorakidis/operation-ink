import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDoor, doorOpenSide, isDoorFullyOpen, setDoorOpen, updateDoors } from '../src/world/doors'

// Where the middle of the leaf ends up, in world space.
const leafMiddle = (door: THREE.Group) => {
  const hinge = door.children.find(child => child.userData.doorHinge)!
  door.updateMatrixWorld(true)
  return hinge.localToWorld(new THREE.Vector3(door.userData.width / 2, 1, 0))
}
const swing = (door: THREE.Group) => { for (let i = 0; i < 120; i++) updateDoors([door], 1 / 60) }

for (const angle of [0, Math.PI / 2, -Math.PI / 3, Math.PI]) {
  for (const side of [1, -1]) {
    const door = createDoor({ name: 'test', x: 5, z: -3, floor: 0, angle })
    door.updateMatrixWorld(true)
    // Stand 1.5 m in front of or behind the closed door, measured along its own normal.
    const opener = door.localToWorld(new THREE.Vector3(0, 0, 1.5 * side))
    setDoorOpen(door, true, false, opener)
    swing(door)
    assert(isDoorFullyOpen(door), 'The leaf finishes opening')
    const leaf = leafMiddle(door), doorCentre = door.localToWorld(new THREE.Vector3())
    const towardOpener = opener.clone().sub(doorCentre).setY(0).normalize()
    assert(leaf.clone().sub(doorCentre).setY(0).dot(towardOpener) < -0.3, `angle ${angle.toFixed(2)}, side ${side}: the leaf swings away from the opener`)
    setDoorOpen(door, false); swing(door)
    assert(Math.abs(door.children.find(child => child.userData.doorHinge)!.rotation.y) < 1e-6, 'Closing returns the leaf exactly to its frame')
  }
}
console.log('PASS Doors in every orientation swing away from whoever opens them, from both sides, and close exactly')

{
  const door = createDoor({ name: 'reopen', x: 0, z: 0, floor: 0 })
  door.updateMatrixWorld(true)
  const front = new THREE.Vector3(0, 0, -1.5), back = new THREE.Vector3(0, 0, 1.5)
  assert.equal(doorOpenSide(door, front), 1); assert.equal(doorOpenSide(door, back), -1)
  setDoorOpen(door, true, false, front); swing(door)
  setDoorOpen(door, true, false, back)
  assert.equal(door.userData.openSide, 1, 'Using an already-open door does not flip it')
  setDoorOpen(door, false); swing(door); setDoorOpen(door, true, false, back); swing(door)
  assert.equal(door.userData.openSide, -1, 'Reopened from the other side, it swings the other way')
  setDoorOpen(door, true, true, 1)
  assert(isDoorFullyOpen(door) && door.userData.openSide === 1, 'Restores and co-op can set the side directly')
}
console.log('PASS An open door keeps its side; reopening from the other side swings the other way; saved sides restore exactly')
