import * as THREE from 'three'

/** Scene object name → the name players know it by, and an optional note for mission landmarks. */
export const BUILDING_NAMES: Record<string, { label: string; note?: string }> = {
  'Northwest service building': { label: 'Mess hall', note: 'Mission start' },
  'Central long warehouse': { label: 'Central warehouse' },
  'South barracks A': { label: 'Barracks A' },
  'South barracks B · long wing': { label: 'Barracks B' },
  'South barracks B · west wing': { label: 'Barracks B · west wing' },
  'West administration wing': { label: 'Administration' },
  'West utility building': { label: 'Utility building' },
  'Inner gatehouse': { label: 'Gatehouse' },
  'Southwest service shed': { label: 'Service shed' },
  'Southwest stores': { label: 'Southwest stores' },
  'East utility hut A': { label: 'Utility hut' },
  'East utility hut B': { label: 'Medical hut' },
  'West equipment shed A': { label: 'Equipment shed A' },
  'West equipment shed B': { label: 'Equipment shed B' },
  'West fuel storage 1': { label: 'Fuel tank 1' },
  'West fuel storage 2': { label: 'Fuel tank 2' },
  'West fuel storage 3': { label: 'Fuel tank 3' },
  'North water tower': { label: 'Water tower', note: 'Marksman' },
  'West observation tower': { label: 'Watchtower', note: 'Marksman' },
  'Security cabin': { label: 'Security cabin', note: 'Camera controls' },
  'Crew house': { label: 'Crew house', note: 'Alarm reinforcements' },
  'Maintenance shelter': { label: 'Maintenance shelter', note: 'Field supplies' },
  'Detention block and underground cells': { label: 'Detention block', note: 'Hostage cells' },
}

type Label = { element: HTMLElement; anchor: THREE.Vector3; landmark: boolean; size: [number, number] | null }
type Placed = { label: Label; x: number; y: number; distance: number }
const FADE_START = 300, FADE_END = 480, GAP = 4, LEADER = 9

/**
 * Paper name tags pinned above each building for the map views. They are DOM, not scene geometry,
 * so they stay readable at any zoom and never enter collision or the ink outlines.
 */
export class BuildingLabels {
  readonly root = document.createElement('div')
  private labels: Label[] = []
  private point = new THREE.Vector3()
  private local = new THREE.Vector3()

  constructor(scene: THREE.Object3D) {
    this.root.id = 'building-labels'
    this.root.setAttribute('aria-hidden', 'true')
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3()
    scene.traverse(object => {
      const name = BUILDING_NAMES[object.name]
      if (!name || this.labels.some(label => label.element.dataset.building === object.name)) return
      box.setFromObject(object)
      if (box.isEmpty()) return
      const element = document.createElement('div')
      element.className = 'building-label'
      element.dataset.building = object.name
      element.textContent = name.label
      if (name.note) element.append(Object.assign(document.createElement('small'), { textContent: name.note }))
      this.root.append(element)
      this.labels.push({ element, anchor: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 1.2, (box.min.z + box.max.z) / 2),
        landmark: !!name.note, size: null })
    })
    document.body.append(this.root)
  }

  get count() { return this.labels.length }

  /**
   * Place every tag over its building. Tags behind the camera or off screen hide; where tags would overlap,
   * mission landmarks win, then nearer buildings, and the rest wait until zooming makes room.
   */
  update(camera: THREE.Camera) {
    const width = window.innerWidth, height = window.innerHeight
    const perspective = camera instanceof THREE.PerspectiveCamera
    camera.updateMatrixWorld()
    const candidates: Placed[] = []
    for (const label of this.labels) {
      this.local.copy(label.anchor).applyMatrix4(camera.matrixWorldInverse)
      this.point.copy(label.anchor).project(camera)
      const x = (this.point.x + 1) / 2 * width, y = (1 - this.point.y) / 2 * height
      if ((!perspective || this.local.z < 0) && x > -80 && x < width + 80 && y > -40 && y < height + 40) {
        candidates.push({ label, x, y, distance: perspective ? -this.local.z : 0 })
      } else label.element.hidden = true
    }
    candidates.sort((a, b) => Number(b.label.landmark) - Number(a.label.landmark) || a.distance - b.distance)
    const taken: [number, number, number, number][] = []
    for (const { label, x, y, distance } of candidates) {
      const { element } = label
      element.hidden = false
      // Measure once while visible; the tag's text never changes.
      label.size ??= [element.offsetWidth, element.offsetHeight]
      const [w, h] = label.size
      const box: [number, number, number, number] = [x - w / 2 - GAP, y - LEADER - h - GAP, x + w / 2 + GAP, y - LEADER + GAP]
      if (taken.some(([l, t, r, b]) => box[0] < r && box[2] > l && box[1] < b && box[3] > t)) { element.hidden = true; continue }
      taken.push(box)
      element.style.opacity = String(1 - THREE.MathUtils.smoothstep(distance, FADE_START, FADE_END) * 0.5)
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`
    }
  }

  dispose() { this.root.remove(); this.labels = [] }
}
