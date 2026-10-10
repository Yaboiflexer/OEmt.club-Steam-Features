# OEmt.club — Architecture (Phase 1)

Status: Phase 1 foundation. Last audited upstream commit: `fb75bf7` (SteamClientHomebrew/Millennium `main`).

## 1. What Millennium actually is (audit summary)

| Layer | Location | Tech | Notes |
|---|---|---|---|
| Bootstrap | `src/bootstrap/win32` | C++ | Ships as `wsock32.dll` in the Steam folder; Steam loads it, it loads `millennium.dll`. |
| Core | `src/engine`, `src/system`, `src/bindings`, `src/mep` | C++23 | CDP connection to Steam's CEF, plugin manager, theme manager, config, logger, health checks, MEP (dev/inspection protocol), updater. |
| Hook helper | `src/instrumentation` | C++ | `millennium.hhx64.dll`. |
| Plugin backend host | `src/lua_host` | C++ + LuaJIT (fork in `thirdparty/forks/luajit`) | **One sandboxed process per plugin** (`millennium.luavm64.exe`). Backends are Lua, not Python (older Millennium used Python). |
| Crash handler | `src/crash_handler` | C++ | `millennium.crashhandler64.exe`. |
| Steam-side UI | `src/typescript/frontend` | TS/React | Millennium settings, theme/plugin managers, Quick CSS, logs. Runs inside Steam's own React. |
| Plugin SDK | `src/typescript/sdk` | TS | `millennium` import for plugins: `definePlugin`, Steam components (`Field`, `Toggle`, `DialogButton`, …), `SteamClient` typings. **LGPL-2.1.** |
| Plugin compiler | `starlight/` | Rust | Packs `millennium.toml` + Lua backend + TS frontend into a single `.star` file. |
| Tests | `tests/cpp` (Catch2), `tests/lua`, `src/typescript/tests/ffi` | | Run automatically after a CMake build (`run_all_tests`). |
| Windows build | `CMakePresets.json` → `windows-release` / `windows-debug` | MSVC + Ninja | CI: `.github/workflows/ci.yml` on `windows-latest`. |

Plugin contract (from `src/lua_host/main.cc` and the official PluginTemplate):

- `backend/main.lua` returns a table with optional `on_load`, `on_unload`, `on_frontend_loaded`, `patches`.
- **Global** Lua functions are callable from the frontend (`backend.fnName(...)`). Arguments are positional; return values are converted to JSON (≤ 8 MB).
- Plugin settings persist through `millennium.config.get/set/get_all/on_change` (stored by Millennium in its `config.json` under `plugins.<name>.config`).
- The frontend's `definePlugin(() => ({ title, icon, content }))` renders inside Millennium's settings / quick-access panel.

## 2. Decision: where OEmt lives

**OEmt Phase 1 is a Millennium plugin (`club.oemt.core`), not a fork of Millennium's C++ core.**

Reasons:

1. Every Phase 1 feature (settings, logging, diagnostics, capability detection, Steam library reading, integration detection) is achievable through the supported plugin API. Nothing required changing `millennium.dll`.
2. Zero core changes means upstream security fixes and updates merge cleanly, and Steam + Millennium behaviour is preserved by construction.
3. The plugin runs in its own LuaJIT process. If OEmt crashes, Millennium reports it and Steam keeps running.
4. Renaming Millennium binaries or rebranding its settings would break Millennium's updater and plugin ecosystem for no gain.

Separation of code:

```
Millennium/            ← upstream, untouched in Phase 1
  oemt/                ← everything OEmt
    plugin/            ← the OEmt plugin (millennium.toml, backend/*.lua, frontend/*.tsx)
    tests/lua/         ← unit tests for the OEmt backend (run under LuaJIT, no Steam needed)
    scripts/           ← build/test helpers (PowerShell + bash)
    docs/              ← this file, BUILD.md, ROADMAP.md, STATUS.md
  .github/workflows/oemt-windows.yml  ← Windows x64 CI for Millennium + OEmt
```

### When a companion Windows app becomes necessary

Not in Phase 1. Candidates for later, each needing its own justification:

- **Media Hub / OEmt Browser** (needs WebView2 with an isolated profile; Steam's CEF is the wrong host for third-party logins).
- **Account Center process control**, *only if* launching TCNo from the Lua host proves unreliable (e.g. console-window flashes from `io.popen` on Windows). The smallest fix is a tiny `oemt-helper.exe` that runs a whitelisted command and returns JSON — not a second UI.

## 3. OEmt plugin internals

```
backend/
  main.lua                 wiring + FFI functions exposed to the UI
  core/util.lua            ids, time, table helpers, platform info
  core/redact.lua          strips secrets, URL queries, user-profile paths
  core/log.lua             structured logger, ring buffer, bounded rotating file sink
  core/schema.lua          settings schema (types, defaults, enums, ranges)
  core/config.lua          validate / load / set / reset / import / export with recovery
  core/events.lua          small pub/sub, each handler isolated with pcall
  core/registry.lua        module registration, dependency ordering, lifecycle, health
  core/vdf.lua             Valve KeyValues (text VDF/ACF) parser
  core/capabilities.lua    environment + dependency checks
  modules/steam_library.lua  reads libraryfolders.vdf + appmanifest_*.acf (on demand, no polling)
  modules/integrations.lua   integration descriptors + install detection, per-integration enable flag
  modules/diagnostics.lua    health report, self-test, redacted export bundle
frontend/
  index.tsx                definePlugin entry; tabbed OEmt panel
  api.ts                   typed wrappers around backend calls + error normalisation
  theme.ts                 OEmt palette (charcoal + steel blue rgb(87,121,153))
  views/*.tsx              Home, Library, Integrations, Settings, Diagnostics
```

Module lifecycle: `register → init(ctx) → start(ctx) → stop(ctx)`, with `health(ctx)` on demand. A module that throws is marked `failed` with the error recorded; other modules keep running. Modules whose dependencies failed are marked `blocked`.

Logging record shape (JSON Lines on disk):

```json
{"ts":"2026-10-10T14:03:11Z","level":"info","module":"steam_library","event":"scan","cid":"7f3a9c21","outcome":"ok","duration_ms":12.4,"data":{"apps":42}}
```

Keys that look like secrets (`password`, `token`, `cookie`, `secret`, `auth`, `session`, `credential`, …) are replaced with `[redacted]`; URL query strings are stripped; the Windows user-profile path is replaced with `%USERPROFILE%`.

## 4. Licensing

| Component | License | Implication for OEmt |
|---|---|---|
| Millennium core, starlight | MIT | Keep `LICENSE.md` and file headers. |
| Millennium SDK (`src/typescript/sdk`) | LGPL-2.1 | OEmt imports it as a library (dynamic, via Millennium at runtime). Do not copy SDK source into OEmt. |
| LuaJIT fork | MIT | Unchanged. |
| TcNo Account Switcher | **GPL-3.0** | OEmt must **orchestrate it as a separate program** through its documented CLI. Do not copy its code into OEmt or bundle a modified build unless OEmt is relicensed GPL-3. Redistributing the unmodified installer requires offering its source. |

## 5. Security posture

- No admin rights required; the plugin runs inside Millennium's per-plugin Lua process.
- No network calls in Phase 1.
- No credential access, no registry writes, no process injection beyond what Millennium already does.
- Integration detection is read-only file-existence checks in well-known install locations.
- Settings import is schema-validated; unknown keys are dropped, invalid values fall back to defaults and are reported.
