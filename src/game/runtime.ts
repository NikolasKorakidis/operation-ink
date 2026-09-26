import * as THREE from 'three'
import { BulletTrails, bulletNearMiss } from './bullet-trails'
import { PLAYER_BULLET_DAMAGE, PLAYER_HEALTH, fallDamage } from './balance'
import type { EnvironmentCamera } from '../camera'
import type { FirstPersonController } from '../player/controller'
import type { ActionTarget } from '../player/actions'
import { isDoorFullyOpen, setDoorOpen } from '../world/doors'
import { EnemyDirector } from './ai'
import { FirstPersonWeapons } from './weapons'
import { MissionAudio } from './audio'
import { MissionHUD } from './hud'
import { MissionBlood, type BloodSnapshot } from './hit-reactions'
import { MissionImpacts } from './impacts'
import { PlayerHitReactions, type PlayerBulletHit } from './player-hit-reactions'
import { PlayerDeathSequence } from './player-death'
import { EscapeCinematic } from './escape-cinematic'
import { EscapeDust } from './escape-dust'
import { advanceMission, applySharedMission, completeEscape, damageMission, sharedMission, shootMission, initialMission, loadedCount, stationLabel, useStation, type MissionState } from './mission'
import { HostageEscort } from './hostages'
import { SecuritySystem } from './security'
import { RESCUE_LAYOUT } from './rescue-layout'
import { updateRescueJeepDoor } from './rescue-jeep'
import { Teammates } from './teammates'
import { CoopPanel } from './coop-panel'
import { CoopSession } from '../net/session'
import type { CoopMessage, NetSound, PlayerPose } from '../net/hub'
import type { EnemyPuppet, EnemySnapshot, MissionWorld, PlayerSense, Shot, SoundEvent, Station, StationKind, Vec3, WeaponSnapshot } from './types'

type Checkpoint = { mission: MissionState; weapons: WeaponSnapshot; enemies: EnemySnapshot[]; doors: boolean[]; position: Vec3; quaternion: [number,number,number,number]; blood?: BloodSnapshot }

export class MissionRuntime {
  state = initialMission()
  readonly weapons: FirstPersonWeapons
  readonly ai: EnemyDirector
  readonly audio = new MissionAudio()
  readonly blood: MissionBlood
  readonly impacts: MissionImpacts
  readonly bulletTrails: BulletTrails
  readonly playerHits = new PlayerHitReactions()
  readonly death = new PlayerDeathSequence()
  readonly escape = new EscapeCinematic()
  readonly escapeDust: EscapeDust
  readonly hud: MissionHUD
  readonly escort: HostageEscort
  readonly security: SecuritySystem
  readonly teammates: Teammates
  readonly coop: CoopSession
  private coopPanel: CoopPanel
  private poseTimer = 0
  private worldTimer = 0
  /** Host: the latest pose of every other player. */
  private remote = new Map<number, PlayerPose>()
  /** Guest: the host's latest guards and hostage mood, and when they arrived. */
  private hostEnemies: EnemyPuppet[] | null = null
  private hostCower = false
  private lastWorldAt = 0
  private waitingNotice = 0
  /** Guest: doors this player just used keep their local state until the host has heard about it. */
  private doorHold = new Map<number, number>()
  ready = false
  readonly initialized: Promise<void>
  deaths = 0
  // Opt-in protection for staged checks; normal play always starts vulnerable.
  invincible = false
  private abort = new AbortController()
  private checkpoint: Checkpoint | null = null
  private initial: Checkpoint | null = null
  private active = false
  private aiming = false
  private stepTime = 0
  private interactionTime = 0
  private lastCaption = ''
  private lastCaptionAt = -100
  private wasVR = false
  private safePosition = new THREE.Vector3()
  private safeQuaternion = new THREE.Quaternion()
  private hitFlash = 0
  private impactPoint: THREE.Vector3 | null = null
  private disposed = false
  private gunfireUntil = 0

  constructor(scene: THREE.Scene, private camera: EnvironmentCamera,
    readonly player: FirstPersonController, readonly world: MissionWorld, private invalidate: () => void) {
    player.missionMode = true
    player.canPlay = () => this.ready && this.state.phase === 'active' && !this.escape.active
    if (!camera.perspective.parent) scene.add(camera.perspective)
    this.weapons = new FirstPersonWeapons({ scene, camera: camera.perspective, world: player.world,
      aimDistance: (origin, direction, maxDistance) => this.ai.aimDistance(origin, direction, maxDistance),
      emit: event => this.emit(event, true), onShot: shot => this.shot(shot) })
    this.blood = new MissionBlood(scene, player.world, id => {
      const enemy = this.ai?.enemies.find(candidate => candidate.spec.id === id)
      if (!enemy || enemy.state !== 'dead' || enemy.deathClip !== 'dieShotgun') return null
      return enemy.actor.rig.bones.chest.getWorldPosition(new THREE.Vector3())
    })
    this.impacts = new MissionImpacts(scene, player.world)
    this.bulletTrails = new BulletTrails(scene, 'Player bullet')
    this.escapeDust = new EscapeDust(scene)
    player.lookSensitivity = () => this.weapons.lookSensitivity
    this.ai = new EnemyDirector({ scene, world: player.world, doors: player.actions.doors, specs: world.enemies,
      emit: event => this.emit(event, false), damagePlayer: (amount, source, hit, playerId) => this.damageFromGuard(amount, source, hit, playerId),
      onSurfaceHit: (point, direction, surface, weapon) => this.impacts.emit(point, direction, surface, weapon),
      dropWeapon: item => { this.weapons.addPickup(item); this.state.kills++; if (this.role === 'host') this.coop.send({ t: 'drop', item }) }, onHit: hit => {
        this.impactPoint = hit.point.clone(); this.blood.emitHit(hit)
        if (hit.by === undefined || hit.by === this.coop.hub.selfId) this.audio.confirmHit(hit)
      },
      onReact: reaction => { if (this.role === 'host') this.coop.send({ t: 'ereact', r: reaction }) },
      onFire: (index, end) => { if (this.role === 'host') this.coop.send({ t: 'efire', i: index, end: end.toArray() as Vec3 }) } })
    this.hud = new MissionHUD(world, {
      retry: () => { if (this.coop.active) this.respawn(); else this.restart(); void this.audio.unlock(); this.player.requestControl() },
      restart: () => {
        // In co-op the host restarts everyone; a guest's own restart only returns them to the insertion point.
        if (this.role !== 'guest') this.restart()
        else if (this.state.phase === 'complete') this.hud.notify('The host starts the next run.', 4)
        else this.respawn()
        void this.audio.unlock(); this.player.requestControl()
      },
      volume: value => this.audio.setVolume(value), mute: value => this.audio.setMuted(value) })
    player.onPlayingChange = playing => {
      this.hud.setPlaying(playing)
      if (this.escape.active) this.hud.setEscape(this.escape)
    }
    this.teammates = new Teammates(scene, event => this.audio.play(event), invalidate)
    this.coop = new CoopSession(message => this.coopMessage(message))
    this.coop.onChange(() => {
      if (!this.coop.active) { this.teammates.clear(); this.remote.clear(); this.hostEnemies = null }
      for (const id of this.remote.keys()) if (!this.coop.hub.players.has(id)) this.remote.delete(id)
      this.invalidate()
    })
    this.coopPanel = new CoopPanel(document.querySelector('.coop-slot')!, document.querySelector('#coop-status')!, this.coop)
    this.escort = new HostageEscort(scene, player.world, player.actions.doors)
    this.security = new SecuritySystem(player.world, world, this.ai, event => this.emit(event, false))
    this.syncWorld()
    player.actions.extraTargets = () => this.targets()
    player.actions.onAction = target => {
      this.weapons.cancel(); this.aiming = false; this.interactionTime = 0.25
      if (target.kind === 'door' || target.kind === 'ladder') this.emit({ kind: target.kind, position: target.point, radius: target.kind === 'door' ? 8 : 5 }, true)
      if (target.kind === 'door' && this.role === 'guest') {
        const index = this.player.actions.doors.indexOf(target.object as THREE.Group)
        this.doorHold.set(index, performance.now())
        this.coop.send({ t: 'door', id: this.coop.hub.selfId, i: index, open: Boolean(target.object.userData.open) })
      }
    }
    const options = { signal: this.abort.signal }
    document.querySelector('#walk-start')!.addEventListener('click', () => { void this.audio.unlock() }, options)
    window.addEventListener('keydown', this.keyDown, options)
    document.querySelector('#world')!.addEventListener('wheel', event => {
      const wheel = event as WheelEvent
      if (!this.isActive() || !this.aiming || wheel.ctrlKey || wheel.metaKey || wheel.altKey) return
      if (!this.weapons.adjustScopeZoom(-Math.sign(wheel.deltaY))) return
      wheel.preventDefault()
      this.invalidate()
    }, { ...options, passive: false })
    // Toggle aim so firing never requires simultaneous mouse buttons (Magic
    // Mouse / trackpads). Mouse events also report each button independently.
    window.addEventListener('mousedown', event => {
      if (!this.isActive() || event.target !== document.querySelector('#world')) return
      void this.audio.unlock()
      if (event.button === 0) this.weapons.trigger(true)
      if (event.button === 2) {
        this.aiming = this.weapons.canAim && !this.aiming
        if (this.weapons.current && !this.weapons.canAim) this.hud.notify("You can't aim with this weapon.", 2, true)
      }
      this.invalidate()
    }, options)
    window.addEventListener('mouseup', event => {
      if (event.button === 0) this.weapons.trigger(false)
    }, options)
    window.addEventListener('blur', () => this.cancelInput(), options)
    document.addEventListener('pointerlockchange', () => { if (!player.playing) this.cancelInput() }, options)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancelInput() }, options)
    this.initialized = this.initialize()
  }

  private async initialize() {
    try {
      await this.ai.init()
      await this.escort.init()
      if (this.disposed) return
      this.player.world.warm()
      this.escort.sync(this.state)
      const supply = this.world.stations.find(s => s.kind === 'supply')
      if (supply) {
        const point = supply.point.clone().add(new THREE.Vector3(0.7, 0, 0.65))
        const floor = this.player.world.floor(point, 0.1, 2)
        this.weapons.addPickup({ id: 'maintenance-smg', name: 'smg', magazine: 24, reserve: 48,
          position: [point.x, Number.isFinite(floor) ? floor : 0.12, point.z] })
        this.weapons.addPickup({ id: 'maintenance-sniper', name: 'sniper', magazine: 5, reserve: 15,
          position: [point.x - 1.4, Number.isFinite(floor) ? floor : 0.12, point.z + 0.6] })
      }
      this.placeAtInsertion()
      this.initial = this.snapshot()
      this.checkpoint = structuredClone(this.initial)
      this.ready = true; this.hud.ready(); this.invalidate()
      // An invite link (?join=ROOM) connects straight away and shows the room on the Co-op page.
      const room = new URLSearchParams(location.search).get('join')
      if (room) { this.hud.showCoop(); void this.coop.join(room) }
    } catch (error) {
      if (this.disposed) return
      console.error('Mission loading failed', error)
      this.hud.error(`Could not load the mission: ${error instanceof Error ? error.message : String(error)}. Reload this page to retry.`)
      this.invalidate()
    }
  }

  private placeAtInsertion() {
    this.player.actions.reset()
    this.player.body.teleport(new THREE.Vector3(...this.world.spawn))
    this.player.world.refresh()
    this.player.body.update(1/60,new THREE.Vector3(),false)
    this.player.actions.syncCamera(this.camera.perspective)
    this.camera.perspective.lookAt(new THREE.Vector3(...this.world.lookAt))
    this.safePosition.copy(this.player.body.position); this.safeQuaternion.copy(this.camera.perspective.quaternion)
  }

  private isActive() { return this.ready && this.state.phase === 'active' && !this.escape.active && this.player.enabled && this.player.playing && !this.player.immersive }
  private cancelInput() { this.aiming = false; this.weapons.cancel() }
  private keyDown = (event: KeyboardEvent) => {
    if (this.escape.active) return
    const zoomKey = event.code === 'KeyQ' || event.code === 'KeyE'
    if (event.ctrlKey || event.metaKey || event.altKey || (event.repeat && !zoomKey) || !this.player.enabled || this.player.immersive) return
    if (event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea,summary,[contenteditable="true"]')) return
    if (event.code === 'KeyM') {
      event.preventDefault()
      if (this.state.phase !== 'active') return
      if (this.player.playing) { this.player.pause(); this.hud.showMap() }
      else this.player.requestControl()
      this.cancelInput(); this.invalidate(); return
    }
    if (!this.isActive()) return
    if (zoomKey) {
      if (!this.aiming || !this.weapons.adjustScopeZoom(event.code === 'KeyE' ? 1 : -1)) return
      event.preventDefault(); this.invalidate(); return
    }
    switch (event.code) {
      case 'KeyR': if (this.weapons.reload()) this.aiming = false; break
      case 'Digit1': this.weapons.switchSlot(0); break
      case 'Digit2': this.weapons.switchSlot(1); break
      case 'Digit3': this.weapons.switchSlot(2); break
      case 'Digit4': this.weapons.switchSlot(3); break
      case 'Digit5': this.weapons.switchSlot(4); break
      case 'KeyG': this.weapons.drop(this.player.body.position); break
      default: return
    }
    if (!this.weapons.canAim) this.aiming = false
    event.preventDefault(); this.invalidate()
  }

  private targets(): ActionTarget[] {
    if (!this.isActive() || this.state.jeep === 'escaping') return []
    const targets: ActionTarget[] = []
    for (const station of this.world.stations) {
      let label = stationLabel(this.state,station.kind,station.id)
      if (station.kind === 'jeep' && label === 'Board jeep' && this.gateOpening()) label = 'Gate opening'
      if (label) targets.push({ object: station.object, point: station.point, kind: 'mission', label,
        descending: false, use: () => this.use(station) })
    }
    for (const item of this.weapons.pickupTargets()) targets.push({ ...item, kind: 'pickup', descending: false, use: () => this.weapons.pickup(item.id) })
    return targets
  }

  private use(station: Station) {
    if (!this.isActive()) return false
    const eye = this.camera.perspective.position
    if (eye.distanceTo(station.point) > 2.65 || !this.player.world.visible(eye, station.point, station.object)) return false
    if (station.kind === 'jeep' && this.gateOpening()) {
      this.hud.notify('Wait for the exit gate to finish opening.', 3)
      return false
    }
    // The host's compound owns shared objectives, so a guest asks for them. Supplies heal only this player.
    if (this.role === 'guest' && station.kind !== 'supply') {
      this.coop.send({ t: 'use', id: this.coop.hub.selfId, kind: station.kind, station: station.id })
      this.weapons.cancel()
      return true
    }
    const result = useStation(this.state,station.kind,station.id)
    this.hud.notify(result.message,7)
    if (!result.changed) return false
    this.weapons.cancel()
    this.stationUsed(station)
    return true
  }

  private stationUsed(station: Station) {
    this.emit({ kind: station.kind === 'distraction' ? 'bell' : 'objective',
      position: station.point.clone(), radius: station.kind === 'distraction' ? 27 : 6 }, station.kind === 'distraction')
    if (station.kind === 'rally') this.escort.rally(this.state)
    if (station.kind === 'jeep') {
      this.beginEscape()
    }
    if (this.state.phase === 'complete') { this.player.pause(); this.cancelInput() }
    this.syncWorld(); this.invalidate()
  }

  private gateOpening() {
    return this.state.gateOpen && this.world.rescue && !isDoorFullyOpen(this.world.rescue.gate)
  }

  private emit(event: SoundEvent, audible: boolean) {
    // The host shares its compound's sounds (guards, alarms, impacts). Each player hears their own near misses.
    if (!audible && this.role === 'host' && event.kind !== 'enemy-bullet-whiz') this.coop.send({ t: 'sound', e: netSound(event) })
    if (this.death.active) return
    if ((event.kind.startsWith('shot-') || event.kind.startsWith('enemy-shot')) && event.position) {
      if (this.state.hostages.some(h => h.status === 'following' && event.position!.distanceTo(new THREE.Vector3(...h.position)) < 15)) this.gunfireUntil = this.state.elapsed + 1.1
    }
    const eye = this.camera.perspective.position
    const distance = event.position ? eye.distanceTo(event.position) : 0
    const inRange = !event.position || distance <= (event.radius ?? 38)
    if (inRange) this.audio.play(event)
    if (audible && event.radius && event.position) {
      if (this.role === 'guest') this.coop.send({ t: 'noise', id: this.coop.hub.selfId, kind: event.kind, position: event.position.toArray() as Vec3, radius: event.radius })
      else this.ai.hear(event)
    }
    if (event.text && inRange && !event.kind.startsWith('shot-') && !event.kind.startsWith('enemy-shot')) {
      const text = event.kind === 'callout' && event.position ? `${this.soundDirection(event.position)} · “${event.text}”` : event.text
      if (text !== this.lastCaption || this.state.elapsed-this.lastCaptionAt>3) {
        this.hud.notify(text,3.5); this.lastCaption=text; this.lastCaptionAt=this.state.elapsed
      }
    }
  }

  private soundDirection(point: THREE.Vector3) {
    const relative = point.clone().sub(this.camera.perspective.position).applyQuaternion(this.camera.perspective.quaternion.clone().invert())
    return Math.abs(relative.x)>Math.abs(relative.z)*0.65 ? relative.x>0?'Right':'Left' : relative.z>0?'Behind':'Ahead'
  }

  private shot(shot: Shot) {
    if (!this.isActive()) return
    if (this.coop.active) shot.by = this.coop.hub.selfId
    if (!shot.pelletIndex) this.state.shots++
    const surface = this.player.world.raySurface(shot.origin, shot.direction, shot.range)
    const distance = surface?.distance ?? shot.range
    this.impactPoint = null
    let hit = false
    if (this.role === 'guest') {
      // A guest aims at the guards it sees; the host applies the damage and replies with the reaction.
      const found = this.ai.findHit(shot, distance)
      if (found) {
        hit = true
        this.impactPoint = found.point.clone()
        this.coop.send({ t: 'hit', id: this.coop.hub.selfId, hit: { i: found.index, zone: found.zone, point: found.point.toArray() as Vec3, bone: found.bone,
          distance: found.distance, direction: found.direction.toArray() as Vec3, origin: shot.origin.toArray() as Vec3, weapon: shot.weapon ?? 'ak', damage: shot.damage } })
      }
    } else {
      this.ai.nearMiss(shot,distance)
      hit=this.ai.hit(shot,distance)
    }
    if (hit) this.hitFlash = 0.15
    const end=this.impactPoint ?? shot.origin.clone().addScaledVector(shot.direction,distance)
    const impact = !hit && surface ? () => {
      this.audio.play({kind:'impact',position:end,radius:18})
      this.impacts.emit(end, shot.direction, surface, shot.weapon)
    } : undefined
    this.bulletTrails.emit(shot.origin, end, shot.weapon, undefined, impact)
    this.coop.send({ t: 'shot', id: this.coop.hub.selfId, origin: shot.origin.toArray() as Vec3, end: end.toArray() as Vec3, weapon: shot.weapon ?? 'ak' })
  }

  damage(amount: number, source?: THREE.Vector3, hit?: PlayerBulletHit) {
    // Bullets are fixed quarter-health hits with brief immunity; the weapon's own amount still scales the flinch and sound.
    if (this.invincible || !this.isActive()) return
    if (!(hit && amount > 0 ? shootMission(this.state, PLAYER_BULLET_DAMAGE) : damageMission(this.state, amount))) return
    if (this.state.phase !== 'dead' && !this.hud.reducedMotion) {
      const point = this.player.body.position.clone().add(new THREE.Vector3(0, 1.17, 0))
      this.playerHits.hit(hit ?? { region: source ? 'torso' : 'leg', side: 0, point,
        direction: source ? point.clone().sub(source) : new THREE.Vector3(0, 1, 0) },
        amount, this.player.body.grounded && !this.player.actions.traversing)
    }
    this.hud.hurt(); this.audio.play({kind:'damage'})
    // Share the local hurt recording, impact thump and shading for bullets and hard landings.
    this.audio.play({ kind: 'bullet-hit', intensity: Math.min(1, amount / 28) })
    this.hud.hitFrom(1, source ? this.soundDirection(source) : 'Below')
    this.hud.notify(source ? `Taking fire · ${this.soundDirection(source).toLowerCase()}. Break line of sight.` : 'You fell. Find a safer route.',2.5)
    if (this.state.phase==='dead') {
      this.playerHits.clear(); this.deaths++
      const bulletDirection = hit?.direction ?? (source ? this.camera.perspective.position.clone().sub(source) : undefined)
      this.death.begin(this.camera.perspective, this.player.body.position, this.player.world, this.hud.reducedMotion, bulletDirection)
      this.weapons.beginDeath()
      this.player.pause(); this.player.actions.reset(); this.cancelInput()
      this.player.body.velocity.set(0, 0, 0)
      this.audio.beginDeath()
      this.hud.setScoped(false); this.hud.clearThreat(); this.hud.setDeath(this.death)
    }
    this.invalidate()
  }

  private snapshot(): Checkpoint {
    return { mission:structuredClone(this.state),weapons:this.weapons.snapshot(),enemies:this.ai.snapshot(),
      doors:this.player.actions.doors.map(door=>Boolean(door.userData.open)),position:this.player.body.position.toArray() as Vec3,
      quaternion:this.camera.perspective.quaternion.toArray() as [number,number,number,number], blood:this.blood.snapshot() }
  }

  private restore(saved: Checkpoint) {
    this.escape.reset(this.camera.perspective)
    this.escapeDust.clear()
    this.death.reset(); this.weapons.resetDeath()
    this.playerHits.clear()
    this.player.pause(); this.cancelInput(); this.audio.reset(); this.player.actions.reset()
    this.state=structuredClone(saved.mission)
    this.player.movementLocked = false; this.gunfireUntil = 0
    this.player.actions.doors.forEach((door,i)=>setDoorOpen(door,saved.doors[i]??false,true))
    this.player.world.refresh(); this.ai.restore(structuredClone(saved.enemies)); this.weapons.restore(structuredClone(saved.weapons)); this.blood.restore(saved.blood)
    this.player.body.teleport(new THREE.Vector3(...saved.position)); this.player.actions.syncCamera(this.camera.perspective)
    this.camera.perspective.quaternion.fromArray(saved.quaternion)
    this.safePosition.copy(this.player.body.position); this.safeQuaternion.copy(this.camera.perspective.quaternion)
    this.stepTime=0; this.interactionTime=0; this.hitFlash=0; this.lastCaptionAt=-100
    this.bulletTrails.clear(); this.impacts.clear(); this.hud.reset(); this.security.reset(); this.syncWorld(true); this.invalidate()
  }

  retry() { if(this.checkpoint) { this.restore(this.checkpoint); this.hud.notify('Mission reset.',3) } }
  restart() {
    if(!this.initial) return
    this.checkpoint=structuredClone(this.initial); this.deaths=0; this.restore(this.initial)
    this.hud.notify('Mission restarted.',3)
    this.doorHold.clear()
    if (this.role === 'host') { this.coop.send({ t: 'restart' }); this.sendWorld() }
  }

  private syncWorld(resetEscort = false) {
    const rescue = this.world.rescue
    if (rescue) {
      setDoorOpen(rescue.gate, this.state.gateOpen)
      rescue.cellDoors.forEach((door, index) => {
        const released = this.state.hostages[index].status !== 'captive'
        door.userData.missionLocked = !released
        setDoorOpen(door, released)
      })
      rescue.jeep.position.set(...RESCUE_LAYOUT.escapeRoute[0])
      if (resetEscort) {
        rescue.jeep.quaternion.identity()
        for (const wheel of rescue.jeep.userData.wheels as THREE.Group[] ?? []) wheel.rotation.set(0, 0, 0)
        const door = rescue.jeep.userData.passengerDoor as THREE.Group
        door.rotation.y = 0
      }
      this.player.world.refresh()
    }
    if (resetEscort) this.escort.sync(this.state)
    this.security.sync(this.state)
    if (this.state.alarm !== 'active') this.audio.setAlarm(false)
  }

  private beginEscape() {
    // A co-op extraction takes the whole team, including a player who is down.
    if (this.coop.active && this.state.phase === 'dead') {
      this.death.reset(); this.weapons.resetDeath(); this.hud.clearDeath()
      this.state.phase = 'active'; this.state.health = PLAYER_HEALTH.max
    }
    this.cancelInput(); this.playerHits.clear()
    this.player.actions.reset(); this.player.movementLocked = true
    this.player.body.velocity.set(0, 0, 0)
    this.weapons.update(0, { active: false, climbing: false, moving: 0, aiming: false,
      reducedMotion: this.hud.reducedMotion, feet: this.player.body.position })
    this.hud.setScoped(false); this.hud.clearThreat()
    this.bulletTrails.clear(); this.ai.bulletTrails.clear()
    this.escape.begin(this.camera.perspective)
    this.escapeDust.clear()
    this.player.pause()
    this.hud.setEscape(this.escape)
    this.audio.setAlarm(false)
    if (this.role === 'host') this.sendWorld()
  }

  private updateEscape(dt: number, elapsed: number) {
    const visible = this.player.enabled && !this.player.immersive
    const playing = visible && !document.hidden && this.escape.running
    const step = playing ? dt : 0
    const cinematicStep = playing ? elapsed : 0
    if (!visible) { this.hud.clearEscape(); this.audio.setActive(false); return false }
    this.escape.update(cinematicStep)
    const position = this.escape.position
    this.state.escapeProgress = this.escape.progress
    this.escort.jeepOffset.copy(position).sub(new THREE.Vector3(...RESCUE_LAYOUT.escapeRoute[0]))
    this.escort.jeepRotation.copy(this.escape.rotation)
    this.world.rescue?.jeep.position.copy(position)
    const jeep = this.world.rescue?.jeep
    if (jeep) {
      jeep.quaternion.copy(this.escape.rotation)
      for (const wheel of jeep.userData.wheels as THREE.Group[] ?? []) {
        wheel.rotation.y = wheel.position.x > 0 ? this.escape.steering : 0
        wheel.rotation.z = -this.state.escapeProgress / jeep.userData.wheelRadius
      }
    }
    this.escapeDust.update(cinematicStep, position, this.escape.rotation, this.escape.speed)
    // Keep the player aboard for world state, while the camera stays outside.
    this.player.body.teleport(new THREE.Vector3(-0.35, -0.12, -0.46).applyQuaternion(this.escape.rotation).add(position))
    if (playing) {
      advanceMission(this.state, step)
      this.player.world.refresh()
      if (this.role === 'guest') this.ai.follow(step, null)
      else this.ai.update(step, { feet: this.player.body.position, eye: this.camera.perspective.position,
        velocity: this.player.body.velocity, alive: false, radioEnabled: false })
      this.escort.update(step, this.state, this.player.body.position, false)
      if (jeep) updateRescueJeepDoor(jeep, this.state.hostages[0].position, true, step)
      this.blood.update(step); this.impacts.update(step); this.bulletTrails.update(step)
      this.security.sync(this.state, this.state.elapsed)
    }
    if (completeEscape(this.state, this.escape.crossedGate && loadedCount(this.state) === this.state.hostages.length)) {
      this.hud.notify('Hostage safely extracted.', 8)
    }
    this.escape.applyCamera(this.camera.perspective)
    this.audio.setActive(playing && !this.escape.menuVisible)
    this.audio.setAlarm(false); this.audio.update(this.camera.perspective)
    this.hud.update(step, this.state, { playing: false, enabled: true, weapon: this.weapons.current, reloading: false,
      position: this.player.body.position, yaw: 0, deaths: this.deaths, ready: this.ready })
    this.hud.setEscape(this.escape)
    return playing && this.escape.running
  }

  update(dt:number, elapsed = dt) {
    this.finishFrame()
    const landingSpeed = this.player.body.landingSpeed
    this.player.body.landingSpeed = 0
    // Teammates keep moving while this player pauses, dies or rides out; keep rendering while in a room.
    const coop = this.syncCoop(dt)
    if (this.escape.active) return this.updateEscape(dt, elapsed) || coop
    const active=this.isActive()
    if (this.player.immersive || !this.player.enabled || this.state.phase !== 'active') {
      this.playerHits.clear(); this.hud.clearThreat()
      if (this.player.immersive || !this.player.enabled || !this.death.active) {
        this.bulletTrails.clear(); this.ai.bulletTrails.clear()
      }
    }
    if(this.player.immersive && !this.wasVR) {
      this.cancelInput()
      // Entering VR resets transit to a tower landing. Preserve that safe
      // location, rather than the previous frame's position halfway along a cable.
      this.safePosition.copy(this.player.body.position)
      this.safeQuaternion.copy(this.camera.perspective.quaternion)
    }
    if(!this.player.immersive && this.wasVR) {
      this.player.body.teleport(this.safePosition); this.player.actions.syncCamera(this.camera.perspective)
      this.camera.perspective.quaternion.copy(this.safeQuaternion)
    }
    this.wasVR=this.player.immersive
    let deathVisible = this.death.active && this.player.enabled && !this.player.immersive
    const deathPlaying = deathVisible && !this.death.menuVisible && !document.hidden
    if(active!==this.active) { this.cancelInput(); this.active=active }
    this.audio.setActive(active || deathPlaying)
    const role = this.role
    if(active) {
      if (role === 'solo') advanceMission(this.state,dt)
      const body=this.player.body
      const bounds=this.world.bounds
      if(body.position.y < -12 || body.position.x<bounds.minX || body.position.x>bounds.maxX || body.position.z<bounds.minZ || body.position.z>bounds.maxZ) {
        body.teleport(this.safePosition); this.player.actions.syncCamera(this.camera.perspective)
        this.hud.notify('The perimeter is closed. Follow the marked routes.',3)
      } else if (!this.player.actions.traversing) this.damage(fallDamage(landingSpeed))
      if (Math.abs(body.position.x - 117) < 10 && body.position.z > -31 && body.position.z < -2) this.state.detentionFound = true
      if (this.state.detentionFound && body.position.y < -2.8) this.state.cellsReached = true
      // In co-op the host steps the compound for everyone below, and guests mirror it.
      if (role === 'solo') {
        this.security.update(dt, this.state, this.camera.perspective.position)
        this.ai.update(dt,{feet:body.position,eye:this.camera.perspective.position,velocity:body.velocity,alive:this.state.phase==='active',radioEnabled:true,
          yaw:new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion,'YXZ').y})
        const danger = this.gunfireUntil > this.state.elapsed
        this.escort.update(dt, this.state, body.position, danger)
        this.updateJeepDoor(dt)
        this.blood.update(dt)
        this.impacts.update(dt)
      }
      const speed=Math.hypot(body.velocity.x,body.velocity.z)
      if(speed>0.5 && body.grounded || this.player.actions.climbing) {
        this.stepTime+=dt
        if(this.stepTime>(this.player.actions.climbing?0.5:speed>5?0.3:0.48)) {
          this.stepTime=0; this.emit({kind:this.player.actions.climbing?'ladder':'footstep',position:body.position.clone(),radius:speed>5?15:6},true)
        }
      } else this.stepTime=0
      this.safePosition.copy(body.position); this.safeQuaternion.copy(this.camera.perspective.quaternion)
      this.interactionTime=Math.max(0,this.interactionTime-dt)
    } else if (deathPlaying && role === 'solo') {
      // Losing player control does not pause the world. Finish blood flight,
      // corpse animations and NPC movement until the actual menu opens.
      this.player.world.refresh()
      this.ai.update(dt, { feet: this.player.body.position, eye: this.camera.perspective.position,
        velocity: this.player.body.velocity, alive: false, radioEnabled: false,
        yaw: new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion, 'YXZ').y })
      this.escort.update(dt, this.state, this.player.body.position, true)
      this.blood.update(dt); this.impacts.update(dt)
      this.security.sync(this.state, this.state.elapsed + this.death.elapsed)
      this.updateJeepDoor(dt)
    }
    if (role === 'host') this.hostStep(dt)
    else if (role === 'guest') this.guestStep(dt)
    const reactionActive = this.isActive() && this.state.jeep !== 'escaping'
    const hitPose = this.playerHits.update(reactionActive ? dt : 0,
      new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion,'YXZ').y, this.hud.reducedMotion)
    if (reactionActive) {
      const zoom = this.aiming && this.weapons.current?.name === 'sniper' && !this.weapons.reloading ? this.weapons.scopeMagnification : 1
      this.playerHits.applyCamera(this.camera.perspective, this.player.world, 1 / zoom)
    }
    // A lethal AI hit can start the sequence inside this very update.
    deathVisible = this.death.active && this.player.enabled && !this.player.immersive
    if (deathVisible) {
      if (this.death.update(document.hidden ? 0 : dt, this.camera.perspective, this.player.world)) this.audio.play({ kind: 'player-fall' })
      this.weapons.updateDeath(this.death.elapsed, this.death.reducedMotion, this.death.hitKick, this.death.hitSide)
      this.hud.setDeath(this.death)
    } else {
      if (this.death.active) { this.death.reset(); this.weapons.resetDeath(); this.hud.clearDeath() }
      this.weapons.update(dt,{active:reactionActive&&this.interactionTime===0,climbing:this.player.actions.traversing,
        moving:this.player.body.velocity.length(),aiming:this.aiming,reducedMotion:this.hud.reducedMotion,feet:this.player.body.position,hitPose})
    }
    this.audio.update(this.camera.perspective)
    this.audio.setAlarm(this.isActive() && this.state.alarm === 'active',
      this.state.alarmPosition ? new THREE.Vector3(...this.state.alarmPosition) : undefined)
    this.hud.setScoped(this.weapons.scoped, this.weapons.scopeMagnification)
    if(active || deathPlaying) {
      this.bulletTrails.update(dt)
      this.hitFlash-=dt
    }
    const crosshair=document.querySelector<HTMLElement>('.crosshair')!
    crosshair.classList.toggle('confirmed-hit', this.hitFlash > 0)
    this.hud.update(dt,this.state,{playing:this.player.playing,enabled:this.player.enabled&&!this.player.immersive,
      weapon:this.weapons.current,reloading:this.weapons.reloading,
      position:this.player.body.position,yaw:new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion,'YXZ').y,deaths:this.deaths,ready:this.ready})
    return active || this.death.running || coop
  }

  /** 'solo' until a co-op room is open; then the host runs the compound and guests mirror it. */
  get role(): 'solo' | 'host' | 'guest' { return this.coop?.active ? this.coop.hub.role : 'solo' }

  private updateJeepDoor(dt: number) {
    if (!this.world.rescue) return
    const hostage = this.state.hostages[0]
    updateRescueJeepDoor(this.world.rescue.jeep, hostage.position, hostage.status === 'loaded', dt)
  }

  private coopMessage(message: CoopMessage) {
    const role = this.role, self = this.coop.hub.selfId
    switch (message.t) {
      case 'pose': this.teammates.pose(message.id, message.pose); this.remote.set(message.id, message.pose); break
      case 'shot':
        this.teammates.shot(message.id, message.origin, message.end, message.weapon)
        if (role === 'host') this.guestShot(new THREE.Vector3(...message.origin), new THREE.Vector3(...message.end), message.weapon)
        break
      case 'leave': this.teammates.remove(message.id); this.remote.delete(message.id); break
      case 'hit': if (role === 'host') this.guestHit(message.id, message.hit); break
      case 'noise': if (role === 'host') this.ai.hear({ kind: message.kind, position: new THREE.Vector3(...message.position), radius: message.radius }); break
      case 'door': {
        const door = this.player.actions.doors[message.i]
        if (role === 'host' && door && !door.userData.missionLocked) setDoorOpen(door, message.open)
        break
      }
      case 'use': if (role === 'host') this.guestUse(message.id, message.kind, message.station); break
      case 'world': if (role === 'guest') this.applyWorld(message); break
      case 'efire': if (role === 'guest') this.guestFire(message.i, new THREE.Vector3(...message.end)); break
      case 'ereact': {
        const reaction = role === 'guest' ? this.ai.replayReaction(message.r) : null
        if (reaction) { this.blood.emitHit(reaction); if (reaction.by === self) this.audio.confirmHit(reaction) }
        break
      }
      case 'sound': if (role === 'guest') this.emit(soundEvent(message.e), false); break
      case 'drop': if (role === 'guest') this.weapons.addPickup(message.item); break
      case 'restart': if (role === 'guest') this.restart(); break
      case 'damage':
        if (role === 'guest' && message.to === self) this.damage(message.amount, new THREE.Vector3(...message.source), { region: message.hit.region, side: message.hit.side,
          point: new THREE.Vector3(...message.hit.point), direction: new THREE.Vector3(...message.hit.direction), weapon: message.hit.weapon })
        break
      case 'notice': if (message.to === self) this.hud.notify(message.text, 7); break
    }
    this.invalidate()
  }

  /** A guard's round reaches this player, or is passed to the guest it was fired at. */
  private damageFromGuard(amount: number, source: THREE.Vector3, hit?: PlayerBulletHit, playerId?: number) {
    if (playerId === undefined || this.role !== 'host' || playerId === this.coop.hub.selfId) return this.damage(amount, source, hit)
    if (hit) this.coop.hub.sendTo(playerId, { t: 'damage', to: playerId, amount, source: source.toArray() as Vec3, hit: { region: hit.region, side: hit.side,
      point: hit.point.toArray() as Vec3, direction: hit.direction.toArray() as Vec3, weapon: hit.weapon } })
  }

  /** Every player the host's guards and cameras can notice. Paused or fallen players are left alone. */
  private coopPlayers(): PlayerSense[] {
    const local: PlayerSense = { id: this.coop.hub.selfId, feet: this.player.body.position, eye: this.camera.perspective.position, velocity: this.player.body.velocity,
      alive: this.isActive(), radioEnabled: true, yaw: new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion, 'YXZ').y }
    return [local, ...[...this.remote].map(([id, pose]) => ({ id, feet: new THREE.Vector3(...pose.feet), eye: new THREE.Vector3(...pose.eye),
      velocity: new THREE.Vector3(...pose.vel), alive: pose.alive && pose.active, radioEnabled: true, yaw: pose.yaw }))]
  }

  /** Hostages follow whichever player is closest to them. */
  private escortLeader(players: PlayerSense[]) {
    const hostage = this.state.hostages.find(candidate => candidate.status === 'following') ?? this.state.hostages[0]
    const position = new THREE.Vector3(...hostage.position)
    let leader = this.player.body.position, distance = Infinity
    for (const player of players) {
      const candidate = player.feet.distanceTo(position)
      if (player.alive && candidate < distance) { leader = player.feet; distance = candidate }
    }
    return leader
  }

  /** Host: run the shared compound for every player, even while this player is paused or down. */
  private hostStep(dt: number) {
    if (!this.ready || !this.player.enabled || this.player.immersive || this.state.phase === 'complete' || dt <= 0) return
    advanceMission(this.state, dt, true)
    const players = this.coopPlayers()
    if (!this.isActive()) this.player.world.refresh()
    this.security.update(dt, this.state, players.filter(player => player.alive).map(player => player.eye), true)
    this.ai.update(dt, players)
    this.escort.update(dt, this.state, this.escortLeader(players), this.gunfireUntil > this.state.elapsed)
    this.updateJeepDoor(dt)
    this.blood.update(dt); this.impacts.update(dt)
    this.worldTimer -= dt
    if (this.worldTimer <= 0) this.sendWorld()
  }

  private sendWorld() {
    this.worldTimer = 0.1
    this.coop.send({ t: 'world', mission: sharedMission(this.state), enemies: this.ai.puppets(),
      doors: this.player.actions.doors.map(door => door.userData.open ? '1' : '0').join(''), cower: this.escort.cowering })
  }

  /** Guest: draw the host's compound. Guards and hostages ease between the host's updates. */
  private guestStep(dt: number) {
    if (!this.ready) return
    if (this.state.phase === 'active') advanceMission(this.state, dt)
    this.ai.follow(dt, this.hostEnemies)
    this.escort.follow(dt, this.state, this.hostCower)
    this.updateJeepDoor(dt)
    this.blood.update(dt); this.impacts.update(dt)
    this.security.sync(this.state)
    const now = performance.now()
    if (this.lastWorldAt && now - this.lastWorldAt > 3000 && now - this.waitingNotice > 6000) {
      this.waitingNotice = now
      this.hud.notify('Waiting for the host. Their game tab may be hidden.', 4)
    }
  }

  /** Guest: adopt the host's compound. Doors this player just used keep their state briefly. */
  private applyWorld(message: Extract<CoopMessage, { t: 'world' }>) {
    if (this.escape.active) return
    const shape = () => JSON.stringify([this.state.gateOpen, this.state.camerasActive, this.state.alarm, this.state.hostages.map(hostage => hostage.status)])
    const before = shape(), wasEscaping = this.state.jeep === 'escaping'
    applySharedMission(this.state, message.mission)
    this.hostEnemies = message.enemies; this.hostCower = message.cower
    const now = this.lastWorldAt = performance.now()
    this.player.actions.doors.forEach((door, index) => {
      const open = message.doors[index] === '1'
      if (Boolean(door.userData.open) !== open && now - (this.doorHold.get(index) ?? -Infinity) > 1500) setDoorOpen(door, open)
    })
    if (shape() !== before) this.syncWorld()
    if (!wasEscaping && this.state.jeep === 'escaping') this.beginEscape()
  }

  /** Host: a guest's round passes guards (they react to it) and may frighten a nearby hostage. */
  private guestShot(origin: THREE.Vector3, end: THREE.Vector3, weapon: Shot['weapon']) {
    const distance = origin.distanceTo(end)
    if (distance > 0.01) this.ai.nearMiss({ origin, direction: end.clone().sub(origin).normalize(), range: distance, damage: 0, weapon }, distance)
    if (this.state.hostages.some(hostage => hostage.status === 'following' && origin.distanceTo(new THREE.Vector3(...hostage.position)) < 15)) this.gunfireUntil = this.state.elapsed + 1.1
  }

  /** Host: apply a hit a guest saw on its own screen. */
  private guestHit(id: number, hit: Extract<CoopMessage, { t: 'hit' }>['hit']) {
    const direction = new THREE.Vector3(...hit.direction).normalize()
    this.ai.applyHit({ origin: new THREE.Vector3(...hit.origin), direction, range: hit.distance, damage: hit.damage, weapon: hit.weapon, by: id },
      { index: hit.i, zone: hit.zone, point: new THREE.Vector3(...hit.point), bone: hit.bone as never, distance: hit.distance, direction })
  }

  /** Host: a guest used a shared objective. It works even while the host's own player is down. */
  private guestUse(id: number, kind: StationKind, stationId: string) {
    const station = this.world.stations.find(candidate => candidate.kind === kind && candidate.id === stationId)
    if (!station || kind === 'supply') return
    if (kind === 'jeep' && this.gateOpening()) { this.coop.hub.sendTo(id, { t: 'notice', to: id, text: 'Wait for the exit gate to finish opening.' }); return }
    const phase = this.state.phase
    if (phase === 'dead') this.state.phase = 'active'
    const result = useStation(this.state, kind, stationId)
    if (phase === 'dead') this.state.phase = phase
    if (result.message) this.coop.hub.sendTo(id, { t: 'notice', to: id, text: result.message })
    if (result.changed) this.stationUsed(station)
  }

  /** Guest: replay a guard's shot, with a near-miss crack when it passes close to this player. */
  private guestFire(index: number, end: THREE.Vector3) {
    const muzzle = this.ai.replayFire(index, end)
    if (!muzzle || !this.isActive()) return
    const eye = this.camera.perspective.position
    if (end.distanceTo(eye) < 1.8) return
    const pass = bulletNearMiss(muzzle, end, eye)
    if (pass && this.player.world.visible(pass.point, eye, this.camera.perspective)) this.emit({ kind: 'enemy-bullet-whiz', position: pass.point, source: muzzle, intensity: pass.intensity, radius: 5 }, false)
  }

  /** Co-op: a fallen player returns to the insertion point while the shared compound carries on. */
  private respawn() {
    if (this.escape.active || this.state.phase === 'complete') return
    this.death.reset(); this.weapons.resetDeath(); this.playerHits.clear()
    this.player.pause(); this.cancelInput(); this.audio.reset()
    this.state.phase = 'active'; this.state.health = PLAYER_HEALTH.max; this.state.lastBulletAt = null
    this.player.movementLocked = false
    this.placeAtInsertion()
    this.hud.reset(); this.syncWorld()
    this.hud.notify('Back at the insertion point. Your team is still out there.', 4)
    this.invalidate()
  }

  /** Draw teammates, and share this player's pose about 15 times a second. */
  private syncCoop(dt: number) {
    this.teammates.update(dt)
    if (!this.coop.active) return this.teammates.count > 0
    this.poseTimer -= dt
    if (this.poseTimer <= 0) {
      this.poseTimer = 1 / 15
      const body = this.player.body, direction = this.camera.perspective.getWorldDirection(new THREE.Vector3())
      this.coop.send({ t: 'pose', id: this.coop.hub.selfId, pose: {
        feet: body.position.toArray() as Vec3, yaw: Math.atan2(direction.x, direction.z), pitch: Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)),
        speed: Math.hypot(body.velocity.x, body.velocity.z), weapon: this.weapons.current?.name ?? null,
        aiming: this.aiming, alive: this.state.phase !== 'dead', active: this.isActive(),
        eye: this.camera.perspective.position.toArray() as Vec3, vel: body.velocity.toArray() as Vec3 } })
    }
    return true
  }

  finishFrame() { this.playerHits.removeCamera() }
  dispose() { this.coopPanel.dispose();this.coop.dispose();this.teammates.dispose();this.escape.reset(this.camera.perspective);this.escapeDust.dispose();this.playerHits.clear();this.disposed=true;this.abort.abort();this.bulletTrails.dispose();this.escort.dispose();this.weapons.dispose();this.ai.dispose();this.blood.dispose();this.impacts.dispose();this.audio.dispose();this.hud.dispose();this.player.movementLocked=false;this.player.onPlayingChange=()=>{};this.player.lookSensitivity=()=>1;this.player.actions.extraTargets=()=>[];this.player.actions.onAction=()=>{} }
}

const netSound = (event: SoundEvent): NetSound => ({ kind: event.kind, position: event.position?.toArray() as Vec3 | undefined, radius: event.radius, text: event.text,
  voice: event.voice, speaker: event.speaker, zone: event.zone, weapon: event.weapon, intensity: event.intensity })
const soundEvent = (sound: NetSound): SoundEvent => ({ ...sound, position: sound.position ? new THREE.Vector3(...sound.position) : undefined })
