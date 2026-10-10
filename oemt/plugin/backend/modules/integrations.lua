-- Integration descriptors and install detection.
-- Phase 1 is deliberately honest: OEmt only DETECTS whether an application is installed and records the
-- user's opt-in. No integration talks to an external service yet; every capability is listed with its
-- real support status so the UI never shows a control that does nothing.
local util = require("core.util")

local M = {}

-- capability status: "available" (works now) | "planned" (designed, not built) | "unsupported" (no legitimate API)
M.DEFINITIONS = {
    {
        id = "discord", name = "Discord", phase = 2,
        detect = {
            { env = "LOCALAPPDATA", path = "Discord/Update.exe", variant = "Stable" },
            { env = "LOCALAPPDATA", path = "DiscordPTB/Update.exe", variant = "PTB" },
            { env = "LOCALAPPDATA", path = "DiscordCanary/Update.exe", variant = "Canary" },
        },
        capabilities = {
            { id = "rich_presence", label = "Rich Presence via Discord's local RPC (Game SDK / IPC pipe)", status = "planned" },
            { id = "activity_privacy", label = "Per-game visibility controls", status = "planned" },
            { id = "server_data", label = "Reading private server data", status = "unsupported",
              note = "Requires a bot added to the server with explicit permissions; never via the user's client." },
        },
    },
    {
        id = "spotify", name = "Spotify", phase = 2,
        detect = {
            { env = "APPDATA", path = "Spotify/Spotify.exe", variant = "Desktop installer" },
        },
        detect_note = "Microsoft Store installs live under WindowsApps and are not detected in Phase 1.",
        capabilities = {
            { id = "now_playing", label = "Now playing (Spotify Web API, OAuth PKCE)", status = "planned" },
            { id = "playback_control", label = "Play/pause/skip (Web API; requires Spotify Premium)", status = "planned" },
        },
    },
    {
        id = "soundcloud", name = "SoundCloud", phase = 2,
        detect = {},
        detect_note = "SoundCloud has no desktop app; integration would be web-based.",
        capabilities = {
            { id = "now_playing", label = "Now playing", status = "planned",
              note = "SoundCloud's public API registration is restricted; feasibility must be confirmed before building." },
            { id = "playback_control", label = "Playback control", status = "planned",
              note = "Only possible for playback OEmt hosts itself (e.g. the Media Hub widget)." },
        },
    },
    {
        id = "tcno", name = "TcNo Account Switcher", phase = 2,
        detect = {
            -- default from TcNo's NSIS script: $PROGRAMFILES64\TcNo Account Switcher
            { env = "ProgramFiles", path = "TcNo Account Switcher/TcNo-Acc-Switcher.exe", variant = "Default install" },
        },
        detect_note = "Custom install folders are not detected yet; Phase 2 adds a manual path setting.",
        capabilities = {
            { id = "list_accounts", label = "List saved accounts (--list-accounts=Steam --json)", status = "planned" },
            { id = "switch_steam", label = "Switch Steam account (+s:<SteamID64>)", status = "planned" },
            { id = "switch_and_launch", label = "Switch then launch a game (--run-appid)", status = "planned" },
        },
    },
    {
        id = "insights", name = "Insights.gg", phase = 3,
        detect = {},
        detect_note = "Install location not yet verified; detection deferred to Phase 3.",
        capabilities = {
            { id = "open_app", label = "Open Insights.gg", status = "planned" },
            { id = "clips", label = "Session clip links", status = "planned" },
        },
    },
}

--- getenv: fn(name) -> string|nil ; exists: fn(path) -> bool ; platform: util.platform()
function M.detect_one(def, getenv, exists, platform)
    if not platform.is_windows then
        return { installed = false, status = "unsupported_platform", detail = "Detection is implemented for Windows only" }
    end
    if #def.detect == 0 then
        return { installed = false, status = "not_detectable", detail = def.detect_note }
    end
    for _, d in ipairs(def.detect) do
        local base = getenv(d.env)
        if base and base ~= "" then
            local full = util.join(base, d.path)
            if exists(full) then
                return { installed = true, status = "detected", variant = d.variant, detail = "Found (" .. d.variant .. ")" }
            end
        end
    end
    return { installed = false, status = "not_installed", detail = def.detect_note or "Not found in standard install locations" }
end

function M.module(deps)
    local getenv = deps.getenv or os.getenv
    local exists = deps.exists or util.file_exists
    local platform = deps.platform or util.platform()
    local cache = nil
    local mod = { id = "integrations", name = "Integrations", version = "1.0.0", deps = { "config" } }

    function mod.list(ctx, force)
        if cache and not force then return cache end
        local out = {}
        for _, def in ipairs(M.DEFINITIONS) do
            local ok, det = pcall(M.detect_one, def, getenv, exists, platform)
            if not ok then det = { installed = false, status = "error", detail = tostring(det) } end
            out[#out + 1] = {
                id = def.id, name = def.name, phase = def.phase,
                enabled = ctx.config:get("integrations." .. def.id .. ".enabled") == true,
                detection = det,
                capabilities = util.array(util.deep_copy(def.capabilities)),
            }
        end
        cache = util.array(out)
        ctx.log:info({ module = "integrations", event = "detect", outcome = "ok", data = { count = #out } })
        return cache
    end

    function mod.start(ctx)
        ctx.config:on_change(function(k)
            if k:match("^integrations%.") then cache = nil end
        end)
    end

    function mod.health(ctx)
        local list = mod.list(ctx)
        local detected = 0
        for _, i in ipairs(list) do if i.detection.installed then detected = detected + 1 end end
        return { status = "ok", detail = string.format("%d of %d detected (detection only in Phase 1)", detected, #list) }
    end

    return mod
end

return M
