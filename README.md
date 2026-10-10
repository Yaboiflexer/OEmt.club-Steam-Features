# OEmt.club

A gaming environment that lives inside the Steam client on Windows. OEmt.club adds a full-page,
tabbed hub to Steam (Home, Library, Sessions, Integrations, Performance, Settings, Diagnostics) and keeps
Steam itself fully in charge of your games, accounts and downloads.

`Windows 10/11 x64` · forked from [Millennium](https://github.com/SteamClientHomebrew/Millennium) (MIT)

> **Status: early test builds.** Everything below builds and passes its automated tests, but has not
> yet been validated inside a running Steam client. Expect rough edges.

## What it does

| Tab | What you get |
|---|---|
| **Home** | The game you're playing (or last played) as a hero banner, quick stats, recent games, startup warnings |
| **Library** | Your installed games read straight from Steam's library files, search, launch through Steam, launch problems explained (e.g. missing game files) |
| **Sessions** | Play sessions recorded from Steam's own game start/stop events, stored locally |
| **Integrations** | Detects Discord, Spotify, TcNo Account Switcher; records opt-in for later phases. *Nothing connects to any service yet.* |
| **Performance** | Real measurements only, each labelled with its source (OEmt backend, Steam UI memory, `GetSystemInfo`) |
| **Settings** | Validated settings with import/export |
| **Diagnostics** | Startup checks, module health, self-test, log viewer, one-click redacted diagnostics export |

The tab strip is driven by one registry ([`oemt/plugin/frontend/tabs.ts`](oemt/plugin/frontend/tabs.ts)),
so new features are added as new tabs. Pages are created on first visit and kept alive while hidden;
timers pause when a tab isn't visible.

Privacy: OEmt never stores or logs passwords, tokens or cookies, integrations are opt-in, logs and
exports are redacted (URL query strings, tokens, SteamIDs, your user folder), and the PC hostname is
never shown or exported.

## Install a test build

See [`oemt/scripts/INSTALL.txt`](oemt/scripts/INSTALL.txt) (included in every build zip). In short:
close Steam, remove Millennium if installed, copy the zip's contents into your Steam folder, start Steam.

Install layout:

```
Steam\wsock32.dll                      bootstrap (Steam loads it by this name)
Steam\oemt\lib\oemt.dll                core
Steam\oemt\lib\oemt.hhx64.dll          webhelper hook
Steam\oemt\bin\oemt.luavm64.exe        plugin backend host (one process per plugin)
Steam\oemt\bin\oemt.crashhandler64.exe
Steam\oemt\plugins\club.oemt.core.star the OEmt.club plugin (enabled on first run)
Steam\oemt\themes\  config\  logs\     created on first run
```

Millennium plugins (`.star`) and themes are still compatible; put them in `Steam\oemt\plugins` and
`Steam\oemt\themes`. OEmt.club replaces Millennium; the two can't be installed side by side.

Self-update is **off**: OEmt.club has no release channel yet, and the inherited updater would otherwise
install upstream Millennium over it. Set `OEMT_RELEASES_API_URL` at configure time once releases exist.

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
runs the C++/Lua test suites, and writes `dist\oemt-club-<version>-<time>.zip`. It never writes into
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

## Roadmap

1. **Foundation (now):** core + plugin, library, launching, sessions, settings, logging, diagnostics.
2. **Gaming environment:** account center (TcNo, as a separate process), profiles/workspaces, notes,
   Discord Rich Presence, Spotify now-playing.
3. **Advanced:** opt-in automation rules, Insights.gg links, non-invasive overlay options, extension API.
4. **Media:** Media Hub (allow-listed sites in an isolated WebView2 profile).

## License and credits

OEmt.club is built on [Millennium](https://github.com/SteamClientHomebrew/Millennium) by Project
Millennium, used under the MIT License ([LICENSE.md](LICENSE.md)). The plugin SDK in
`src/typescript/sdk` is LGPL-2.1. See [NOTICE.md](NOTICE.md). OEmt.club is not affiliated with
Project Millennium or Valve; Steam is a trademark of Valve Corporation.
