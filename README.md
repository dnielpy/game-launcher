# Game Launcher

A local game library for Windows. It finds the games installed on your PC, shows them with box art, banners and details, starts them with one click and counts the hours you play.

## Features (phase 1)

- **Automatic discovery.** Checks common game folders on every drive (`Games`, `Juegos`, `GOG Games`, `XboxGames`...), `Program Files` with stricter rules, the Windows uninstall registry, desktop and Start menu shortcuts, and Steam and Epic libraries.
- **Your own folders.** Add any folder under *Locations*; turn any location on or off.
- **Engine-aware detection.** Recognizes Unity, Unreal, GameMaker, Godot, RPG Maker and Ren'Py layouts, and tells a game folder apart from a folder that holds several games.
- **Main executable picking.** Ignores uninstallers, redistributables, crash handlers and anti-cheat helpers. Shortcuts and registry icons anchor the choice; close calls are flagged so you can pick.
- **Clean titles.** Strips repack tags, versions, build numbers and DLC suffixes from folder names.
- **Pending installers.** Repack installers that are not installed yet are listed separately.
- **Safe rescans.** Scans run in a separate process and can be cancelled. Folder sizes are cached. Games that moved are relinked, games that disappeared are marked as not found, games on a disconnected drive are marked unavailable. Nothing you edited by hand is overwritten.

## Covers, details and play time (0.2)

- **Covers and details** come from the public Steam store (no key needed): vertical box art, hero banner, logo, description, genres, developer, release date, player review score and Metacritic. Images are cached in `%APPDATA%/game-launcher/media`.
- **RAWG** is the fallback for games that are not on Steam. Add a free key under *Settings*.
- **Official names**: when a game is matched, the catalog name replaces the folder name (unless you renamed it). Wrong match? *Manage → Search again*.
- **Tools**: launchers, emulators and utilities (MSI Afterburner, RivaTuner, Steam, yuzu...) go to their own section. Move anything between Tools and the library from *Manage*.
- **Updates and duplicates**: update packages (`Game update 1.2 - 1.3`) and self-extracting installers are listed under *Not installed*, not as games. Copies of the same game side by side are merged.
- **Play time**: after you press Play, the launcher watches the process list (`tasklist`) and records the session.

## Getting started

Requirements: Windows 10/11, Node.js 22+.

```bash
npm install        # also rebuilds better-sqlite3 for Electron
npm run dev        # start in development mode
npm test           # run the scanner test suite
npm run dist       # build a Windows installer into dist/
```

The first launch scans your PC automatically. Data lives in `%APPDATA%/game-launcher` (`library.db`, `icons/`, `logs/`).

## Project layout

```
src/
  main/
    scanner/          scan engine (pure Node, fully tested)
      sources/        registry, Steam, Epic, default locations
      worker/         utility process entry point
    db/               SQLite schema, migrations, repository
    services/         scan orchestration, shortcuts, icons, launching
    ipc.ts            validated IPC handlers
  preload/            context bridge (window.api)
  renderer/           React UI
  shared/             types and IPC contract shared by both sides
tests/                Vitest suites with on-disk fixtures
```

## How the scanner decides

1. Every candidate folder is walked once (bounded depth and size) and turned into a `FolderInspection`.
2. `classifyFolder` scores it: engine markers, `steam_api` DLLs, redistributable folders, middleware DLLs, game archives, Inno Setup uninstallers and, for borderline folders, size on disk. Games folders need 30 points; `Program Files` needs 60.
3. `analyzeLayout` checks whether the folder is a single game, a collection or a doubled folder.
4. `pickExecutable` ranks executables by name similarity, depth, size, engine rules, shortcuts and registry icons.
5. Results from every source are merged by install path, and `reconcile` compares them with the stored library.

## Roadmap

- [x] Phase 0: project setup, database, IPC
- [x] Phase 1: scanner, library UI, basic launching
- [x] Phase 2: playtime tracking
- [x] Phase 3: Steam and RAWG metadata, match review
- [ ] Phase 4: full Xbox-style interface
- [ ] Phase 5: statistics
- [ ] Phase 6: SteamGridDB art, gamepad navigation, installer
