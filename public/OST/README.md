# OST: the game's audio

Every sound and piece of music the game loads lives here, in a folder for what it is. The game fetches files from
`OST/<folder>/<file>`; `servedFile` in `src/game/igi-samples.ts` maps each sound id to its folder.

| Folder | What goes in it | Now |
| --- | --- | --- |
| `music/menu/` | The menus' music | `menu-theme.flac`: loops under every menu page (`src/game/menu-audio.ts`) |
| `music/` | Score: mission loops, stingers | The in-mission music is still composed in code (`composeMusic` in `src/game/audio.ts`) |
| `ambience/` | Background beds and room tones | Empty: the low noise bed is synthesized (`startAmbience` in `audio.ts`) |
| `sfx/weapons/` | Shots, reloads, pumps, shells, dry fire, weapon pickup, drop and switch | IGI weapon recordings, CC0 `shot_*` fallbacks |
| `sfx/impacts/` | Bullets hitting walls and bodies | IGI `bul_*`, CC0 `hit_*` fallbacks |
| `sfx/footsteps/` | Steps on each surface, ladder rungs | IGI `walk_*`, CC0 `step_gravel_*` fallbacks |
| `sfx/foley/` | Bodies falling, doors | IGI `bodyfall_*`, `door_open_1`, CC0 `body_fall_*`, `door_0` |
| `sfx/alarms/` | Sirens and alerts (looped files are FLAC, so the loop has no gap) | IGI `alarm_1.flac` |
| `voice/guards/` | Guard callouts and pain | IGI `detected_*`, `ai_hit_*` |
| `voice/player/` | The player being hit | IGI `player_hit_*` |
| `ui/` | Menu clicks, hovers, confirmations | `key-tap.m4a` (hovering a menu choice), `key-strike.m4a` (choosing it): typewriter keys, like the menus' type |

Explosions, the flashbang's crack and ear ringing, the smoke hiss, the C4 beeps, knife swishes and grenade pins are
synthesized in `audio.ts`, so they have no files.

Formats: mono AAC `.m4a` for one-shots, FLAC for anything that loops. Where every recording comes from and its terms
are in [CREDITS.md](CREDITS.md); the Project IGI bank's source names, edits and hashes are in
[igi-manifest.json](igi-manifest.json).

Adding a sound: put the file in its folder, add a pattern for its name to `FOLDERS` in `src/game/igi-samples.ts` if
it is not already covered, and route an event kind to it in `IGI_SAMPLES` (or `SAMPLES` in `audio.ts`).
