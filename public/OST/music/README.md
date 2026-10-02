# music

- `menu/menu-theme.flac` — the menu theme. It loops under every menu page and fades out when play starts
  (`src/game/menu-audio.ts`). FLAC so the loop has no gap; the code also smooths the seam where it jumps back.

The music during play is still composed in code (`composeMusic` in `src/game/audio.ts`). See [../README.md](../README.md).
