# OEmt.club work log

Running notes of what was built, so work can resume after a break. Newest first.

## 2026-10-10: Release candidate (branch `oemt/phase2`)
- Only Discord Rich Presence kept (settings in Settings). Media page, Spotify, SoundCloud and Insights are on `oemt/media-wip`.
- Sidebar music player in Steam's user panel. `oemt-media.exe` (C++/WinRT) reads Windows' media session and system volume. The games list and download bar spacing follows the panel's real height (`--oemt-panel-h`).
- Package `dist/oemt-club-v0.1.0-windows-x86_64.zip`: core, plugin, media helper, OEmt.club and Steam (original) themes, INSTALL.txt (community guide).

## 2026-10-10: Phase 2, integrations (branch `oemt/phase2`)

**Committed**
- `c2a17938` Live integrations:
  - Discord Rich Presence, now playing for Spotify and SoundCloud, media keys.
  - Integrations page rebuilt; Now playing card on Sessions and in Quick Access.
  - TcNo removed.
  - Top bar: dynamic spacing, no wrapping, arrows hidden.
  - Backend runs with the JIT off.
- `5d60d458` Retired settings (`integrations.tcno.enabled`, `accounts.ttl_*`) are deleted on load instead of warning.

**Committed (Insights)**
- Insights card, clips column in Sessions, Discord connection logging. Verified in Steam: "Rich Presence connected" with App ID 1558580525478846607.

**Earlier notes**
- Insights.gg (Insights Capture V3, found at `%LOCALAPPDATA%\Programs\Insights Capture V3`):
  - `modules/insights.lua`:
    - install detection and running check (process list via FFI);
    - Open button;
    - auto-start when a game starts (2-minute cooldown);
    - recordings list from the recordings folder (setting `integrations.insights.recordings_dir`, default `Videos\Insights Capture`);
    - clips matched to sessions (session window + 5 minutes).
  - `reveal` opens only files inside the recordings folder.
  - Backend calls: `insights_status`, `insights_open`, `insights_reveal`. The `sessions` call adds `clips` per history entry, on copies only.
  - `main.lua`: new `scan_files` service (`fs.list_recursive` + size + mtime).
  - `core/win32.lua`: `running(exes)` (Toolhelp process snapshot).
  - Tests: `test_insights.lua`. Lua suite 116/116.

**Waiting on the user**
- Classic Steam themes (Classic Steam Library, OldSteam): saved for later; both repos have no license.

**Known facts**
- The bundled LuaJIT build crashes intermittently with the JIT on. `jit.off()` is set in `backend/main.lua` and `tests/lua/run.lua`.
- The theme's saved colors and conditions in `Steam\oemt\config\config.json` override the new defaults.
- Backups of each install are in `Steam\oemt\backup-<timestamp>`.

## 2026-10-10: Phase 1 wrap-up (`75fbc323` on `oemt/phase1`)
- OEmt opens in Steam's main window once that window exists (it used to navigate too early).
- Route `/oemt/:tab?/:sub?` with redirects.
- One Sessions tab. Home, OEmt Library and Accounts removed; Accounts is kept on `oemt/accounts-wip` (`64efef98`).
- Start page can be an OEmt tab or a Steam page.
- OEmt logo in the theme and plugin; `oemt.ico`; "Steam (original)" empty theme.
- Theme defaults: blue-gray and indigo, 6px corners. Scripts no longer injected into store/community pages.
