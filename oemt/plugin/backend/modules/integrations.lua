-- Integration descriptors and install detection. Every capability is listed with its real support
-- status so the UI never shows a control that does nothing. The live parts (Discord Rich Presence,
-- now playing, media keys) are in modules/integrations_live.lua; all of them are opt-in.
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
            { id = "rich_presence", label = "Rich Presence: the game you are playing and for how long, via Discord's local connection", status = "available",
              note = "Needs a Discord Application ID in Settings (create a free app at discord.com/developers)." },
            { id = "activity_privacy", label = "Choose what shows: game, \"In Steam\" when idle, the song you are listening to", status = "available" },
            { id = "server_data", label = "Reading private server data", status = "unsupported",
              note = "Requires a bot added to the server with explicit permissions; never via the user's client." },
        },
    },
    {
        id = "spotify", name = "Spotify", phase = 2,
        detect = {
            { env = "APPDATA", path = "Spotify/Spotify.exe", variant = "Desktop installer" },
        },
        detect_note = "Microsoft Store installs live under WindowsApps and are not detected; now playing still works.",
        capabilities = {
            { id = "now_playing", label = "Now playing, read from the Spotify window (no login, no API key)", status = "available" },
            { id = "playback_control", label = "Play/pause, next, previous (Windows media keys; no Premium needed)", status = "available",
              note = "Media keys go to whichever app Windows treats as the active player." },
        },
    },
    {
        id = "soundcloud", name = "SoundCloud", phase = 2,
        detect = {},
        detect_note = "SoundCloud has no desktop app; integration would be web-based.",
        capabilities = {
            { id = "now_playing", label = "Now playing, read from the SoundCloud browser tab", status = "available",
              note = "Windows only sees the selected tab of each browser window, so keep SoundCloud's tab selected." },
            { id = "playback_control", label = "Play/pause, next, previous (Windows media keys)", status = "available" },
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
        return { status = "ok", detail = string.format("%d of %d detected", detected, #list) }
    end

    return mod
end

return M
