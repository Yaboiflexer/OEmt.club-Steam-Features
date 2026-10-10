# OEmt.club

OEmt.club for Steam on Windows: your game sessions, Discord Rich Presence, a music player in Steam's
sidebar and the OEmt.club theme, all inside the Steam client. Steam itself stays in charge of your
games, accounts and downloads.

`Windows 10/11 x64` · forked from [Millennium](https://github.com/SteamClientHomebrew/Millennium) (MIT) ·
community: [discord.gg/OEmt](https://discord.gg/OEmt)

## Download

Get `oemt-club-v<version>-windows-x86_64.zip` from [Releases](https://github.com/Yaboiflexer/OEmt/releases/latest)
and follow [`INSTALL.txt`](oemt/scripts/INSTALL.txt) (also inside the zip). In short:

1. Exit Steam completely.
2. If Millennium is installed, delete `wsock32.dll` and the `millennium` folder from your Steam folder.
3. Extract the zip into your Steam folder (usually `C:\Program Files (x86)\Steam`).
4. Start Steam, then pick the theme: Steam menu > OEmt.club > Themes > OEmt.club > Use.

Uninstall: exit Steam, delete `Steam\wsock32.dll` and the `Steam\oemt` folder.

## What you get

| Feature | What it does |
|---|---|
| **Sessions** | Your game history, recorded from Steam's own game start/stop events, plus an opt-in log of your own public IP |
| **Discord Rich Presence** | Built in and on by default: the game you play, for how long, and a "Join OEmt.club" button. No login or token |
| **Sidebar music player** | Controls whatever Windows says is playing (Spotify, a browser tab, ...): cover art, back / play / next, progress, system volume |
| **Themes** | The OEmt.club theme (dark blue-gray, indigo, Lucida Console) and "Steam (original)" |
| **Settings / Diagnostics** | Validated settings with import/export; startup checks, log viewer and a redacted diagnostics export |

Privacy: everything runs on your PC. OEmt.club never asks for, stores or logs passwords, tokens or
cookies. Logs and exports are redacted.

## Install layout

```
Steam\wsock32.dll                      bootstrap (Steam loads it by this name)
Steam\oemt\lib\oemt.dll                core
Steam\oemt\lib\oemt.hhx64.dll          webhelper hook
Steam\oemt\bin\oemt.luavm64.exe        plugin backend host
Steam\oemt\bin\oemt-media.exe          media session + volume helper for the sidebar player
Steam\oemt\plugins\club.oemt.core.star the OEmt.club plugin (enabled on first run)
Steam\oemt\themes\OEmt, SteamOriginal  themes
```

Millennium plugins (`.star`) and themes still work; put them in `Steam\oemt\plugins` and
`Steam\oemt\themes`. OEmt.club replaces Millennium; the two can't be installed side by side.

Self-update checks this repository's GitHub releases when built with
`build.ps1 -ReleasesRepo Yaboiflexer/OEmt` (official builds are).

## Build from source

Requirements: Visual Studio 2022 Build Tools ("Desktop development with C++"), CMake, Bun, Rust.

```powershell
winget install Git.Git Kitware.CMake Oven-sh.Bun Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then, from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File oemt\scripts\build.ps1
```

This builds the core, builds the `starlight` plugin packer, type-checks and packs the OEmt plugin,
runs the C++/Lua test suites, and writes `dist\oemt-club-v<version>-windows-x86_64.zip`. It never writes into
your Steam folder.

Run only the OEmt backend tests (after one build, which produces `build\luajit.exe`):

```powershell
.\build\luajit.exe oemt\tests\lua\run.lua          # all
.\build\luajit.exe oemt\tests\lua\run.lua sessions # filter by file name
```

## Repository layout

| Path | What |
|---|---|
| `oemt/plugin/` | The OEmt.club plugin: Lua backend (`backend/`), React frontend (`frontend/`), `millennium.toml` |
| `oemt/tests/lua/` | Backend unit + end-to-end tests (plain LuaJIT, no Steam needed) |
| `oemt/scripts/` | `build.ps1`, install notes |
| `oemt/docs/` | Architecture notes |
| `src/` | The core (C++), Steam-side UI (TypeScript), plugin SDK, locales; inherited from Millennium |
| `starlight/` | Plugin compiler (`millennium.toml` -> `.star`) |

Internal names such as the `millennium` SDK module, `MILLENNIUM__*` environment variables and the
`millennium.toml` format are kept on purpose so existing plugins keep working.

## License and credits

OEmt.club is built on [Millennium](https://github.com/SteamClientHomebrew/Millennium) by Project
Millennium, used under the MIT License ([LICENSE.md](LICENSE.md)). The plugin SDK in
`src/typescript/sdk` is LGPL-2.1. See [NOTICE.md](NOTICE.md). OEmt.club is not affiliated with
Project Millennium or Valve; Steam is a trademark of Valve Corporation.
