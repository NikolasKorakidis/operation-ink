# Levels

Every level is registered here and built from the shared world kit. The game, the menus, saves, modes and the checks all read the registry, so a new level needs no changes to the runtime.

## Files

| File | What it is |
| --- | --- |
| `catalog.ts` | Every level as plain data: id, name, kind (`campaign`, `training`, `dev`), one-line summary. No imports. |
| `index.ts` | `buildLevel(id)`: the builder for each id. It returns `ground` (static world) and `world` (the mission on it). |
| `proving-ground.ts` | The template level. Copy it to start a new one. |

The compound (`src/world/compound.ts` and `src/game/world.ts`) and the training ground (`src/world/training-ground.ts` and `src/game/tutorial-world.ts`) predate this folder; `index.ts` wraps them.

## Adding a level

1. Copy `proving-ground.ts` to `<id>.ts` and rename its export.
2. Add `{ id, name, kind, summary }` to `LEVEL_CATALOG` in `catalog.ts`, and a builder for it in `index.ts`.
3. Play it with `/?level=<id>` (dev server). A `dev` level is reached only that way; a `campaign` level is also saved, and listed in Load game.
4. Run `npm run test:levels`. It must pass before the level is played (see Checks).
5. Check it in the browser (`.agent/skills/browser-check/SKILL.md`). Look at the briefing map, the insertion, every building inside, and a full run.

## What a level is made of

**Ground** (`THREE.Group`). Everything static: terrain slab, fences, buildings, props and lights. In metres, with north at -Z and y up. The compound's plan coordinates are 0.15 m per reference pixel (`mapPoint` in `world/compound.ts`); a level drawn from a plan image can use the same scale.

| Builder | From | Gives you |
| --- | --- | --- |
| `building({ name, x, z, width, depth, height, type, angle })` | `world/architecture.ts` | A walkable building: walls, windows, roof, entry door, steps and furnished interior. Also its dark room, window daylight, door daylight and caged lamps. `type`: barracks, warehouse, utility, service. The name picks the interior: "administration" (desks with radios, briefing table), "gatehouse" (radio post), "hut B" (medical); a warehouse gets two quest crates. |
| `container`, `truck`, `crates`, `platform` | `world/architecture.ts` | Cover and props. |
| `fence(name, points, height)` | `world/industrial.ts` | Wire fence along a polyline. Blocks walking, not sight or shots. |
| `pipeLadder({...}).finish()` | `world/ladders.ts` | A climbable ladder up to a landing. |
| `createDoor({...})` | `world/doors.ts` | A door the player and guards open. |
| `darkRoom`, `cageLamp`, `windowRow`, `doorwayLight`, `daylightOpening`, `screenLight` | `world/lights.ts` | Lighting for interiors built by hand. Every room you can walk into must be dark and lit by its own lights (the checks enforce this for `userData.enterable`). |
| `Furnishing` (`desk(…, radio)`, `crate`, `bunk`, `table`, `shelf`, …) | `world/interiors.ts` | Furniture. A desk with `radio = true` holds a quest radio; `crate` is a breakable quest crate. |
| `drawPine`, `Draft`, `wallText` | `world/vegetation.ts`, `render/ink.ts` | Trees, any custom geometry in the paper-and-ink style, and hand-lettered signs. Always use `Draft` and the shared fills; never make ad-hoc materials. |

Marker conventions the game picks up anywhere in the scene:

- `userData.weaponSpot = { id, name, magazine, reserve }` places a weapon pickup.
- `userData.questCrate` marks a breakable crate.
- `userData.questItem = 'radio'` marks a radio.
- `userData.kind = 'door'` marks a door.
- `userData.footprint = [w, d]` puts a building on the generated field map.

**World** (`MissionWorld`, in `game/types.ts`):

| Field | Meaning |
| --- | --- |
| `level` | The level's id. |
| `spawn`, `lookAt` | The insertion point, and where the player looks when the run starts. |
| `bounds` | The play area. Leaving it puts the player back. |
| `enemies` | Built with `enemy(type, id, position, options)` from `game/enemy-types.ts`. Types: `rifleman`, `gunner`, `breacher`, `sidearm`, `marksman`, `sledge` (boss with flying hammer), `dummy`. Give `patrol` (a loop of points, starting where he stands) to make him walk, `facing` to aim a post, and `reserve` (plus `alarmExit`) for alarm reinforcements. |
| `stations` | Things the player uses with F. For a goal, use kind `'objective'`; its `label` is the prompt. |
| `goals` | The mission: see below. |
| `briefing` | The pause page: title, premise, `won`/`outro` (the end page), route tips. Leave `map` out and one is drawn from the level. |

## Goals (`game/goals.ts`)

| Kind | Done when |
| --- | --- |
| `reach` | A player is inside the area. |
| `eliminate` | The listed enemies are dead (`'all'` means every non-dummy enemy). |
| `destroy` | The level's quest crates or radios are out of action (all of them, or `count`). |
| `interact` | The `'objective'` station is used. |
| `extract` | A player is inside the area once every other main goal is done. |

- `main: false` makes a side goal: it shows and counts, but never blocks the win.
- `after: [ids]` orders goals.
- `done` is the message shown when the goal completes.

The mission is won when every main goal is done. The run then ends on the pause page under `briefing.won`. Goal progress is part of the mission state, so it saves, restores on retry and is shared in co-op.

## Checks

`scripts/levels-checks.ts` builds every catalog level in Node and checks:

- The player lands and stands at the insertion.
- Every guard post and patrol point is floor a guard fits on.
- Every station can be reached and seen.
- Every goal points at something that exists.
- Every goal area can be walked to from the insertion.
- A run that does everything wins.
- The briefing has a usable map.
- Every enterable building is dark inside.

Each failure names the level and the thing at fault.

## Limits to know

- **Guard route length.** Guards plan routes on a 0.8 m grid within a window around the start and goal, and give up past about 2,200 cells. A guard asked to cross a very large level in one go may not find the way. Give long patrols intermediate points.
- **Single-floor goal areas.** Reach and extract areas are cylinders (3 m tall by default). For an upper floor or a roof, set `center[1]` to that height.
- **One body model.** Every character is the one stickman rig. New enemy looks are made by fitting gear to it, as the Sledge's armour does (`actors.makeBoss`), and are shared with the animation lab.
