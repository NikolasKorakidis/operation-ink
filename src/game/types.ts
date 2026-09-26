import type * as THREE from 'three'
import type { CollisionWorld } from '../player/collision'

export type Vec3 = [number, number, number]
export type WeaponName = 'pistol' | 'ak' | 'smg' | 'shotgun' | 'sniper' | 'silenced' | 'knife'
/** Guards carry firearms only; the knife and suppressed pistol are the player's kit. */
export type GuardWeapon = Exclude<WeaponName, 'silenced' | 'knife'>
export type WeaponItem = { id: string; name: WeaponName; magazine: number; reserve: number; position?: Vec3 }
export type SoundEvent = { kind: string; position?: THREE.Vector3; source?: THREE.Vector3; intensity?: number; radius?: number; text?: string; voice?: string; speaker?: number; weapon?: WeaponName; zone?: import('./hit-reactions').HitZone }
export type EmitSound = (event: SoundEvent) => void
export type StationKind = 'radio' | 'release' | 'brake' | 'signal' | 'extract' | 'supply' | 'distraction' | 'hostage' | 'cameras' | 'alarm' | 'gate' | 'jeep' | 'rally'
export type Station = { id: string; kind: StationKind; object: THREE.Object3D; point: THREE.Vector3; label: string }
export type EnemySpec = { id: string; name: string; position: Vec3; patrol: Vec3[]; weapon: GuardWeapon; reserve?: boolean; alarmExit?: Vec3; facing?: number; role?: 'sniper' | 'guard'; patrolMode?: 'perimeter' }
export type MissionWorld = { root: THREE.Group; stations: Station[]; enemies: EnemySpec[]; spawn: Vec3; lookAt: Vec3; bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; rescue?: { gate: THREE.Group; jeep: THREE.Group; cameras: { id: string; pivot: THREE.Group; lamp: THREE.Mesh }[]; cellDoors: THREE.Group[] } }
/** `id` names a co-op player; solo play leaves it unset. */
export type PlayerSense = { feet: THREE.Vector3; eye: THREE.Vector3; velocity: THREE.Vector3; alive: boolean; radioEnabled: boolean; yaw?: number; id?: number }
export type Shot = { origin: THREE.Vector3; direction: THREE.Vector3; range: number; damage: number; weapon?: WeaponName; pelletIndex?: number; by?: number }
export type MeleeAttack = { origin: THREE.Vector3; direction: THREE.Vector3; damage: number; kind: import('./balance').KnifeAttack }
export type WeaponContext = { scene: THREE.Scene; camera: THREE.PerspectiveCamera; world: CollisionWorld; emit: EmitSound; onShot: (shot: Shot) => void; onMelee?: (attack: MeleeAttack) => void; aimDistance?: (origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) => number }
export type WeaponFrame = { active: boolean; climbing: boolean; moving: number; aiming: boolean; reducedMotion: boolean; feet: THREE.Vector3; hitPose?: import('./player-hit-reactions').PlayerHitPose }
export type WeaponSnapshot = { slots: (WeaponItem | null)[]; selected: number; pickups: WeaponItem[]; nextId: number }
export type EnemyState = 'idle' | 'patrol' | 'guard' | 'suspicious' | 'investigate' | 'combat' | 'search' | 'dead' | 'reserve'
export type EnemySnapshot = { id: string; position: Vec3; yaw: number; health: number; state: EnemyState; suspicion: number; lastKnown: Vec3 | null; timer: number; waypoint: number; [key: string]: unknown }
export type AIContext = { scene: THREE.Scene; world: CollisionWorld; doors: THREE.Group[]; specs: EnemySpec[]; emit: EmitSound; damagePlayer: (amount: number, source: THREE.Vector3, hit?: import('./player-hit-reactions').PlayerBulletHit, playerId?: number) => void; dropWeapon: (item: WeaponItem) => void; onHit?: (hit: import('./hit-reactions').HitReaction) => void; onReact?: (reaction: EnemyReaction) => void; onFire?: (index: number, end: THREE.Vector3) => void; onSurfaceHit?: (point: THREE.Vector3, direction: THREE.Vector3, surface?: import('../player/collision').SurfaceHit, weapon?: WeaponName) => void }
/** A guard's hit reaction, as the host tells co-op guests to replay it. */
export type EnemyReaction = { index: number; clip: string; lethal: boolean; direction: Vec3; travel: number; deathClip: string; hit: { zone: import('./hit-reactions').HitZone; point: Vec3; bone?: string; weapon?: WeaponName; by?: number } }
/** A guard as co-op guests draw it: position, facing, behaviour and pose, without the decision state. */
export type EnemyPuppet = { p: Vec3; y: number; s: EnemyState; v: number; a: Vec3 | null; o: import('../lab/postures').Posture; c: number | null; d: string }
