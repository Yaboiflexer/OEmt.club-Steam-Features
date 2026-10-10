-- OEmt settings schema. Single source of truth for types, defaults, and limits.
-- Keys are flat strings so they map 1:1 onto millennium.config entries.
local M = {}

M.VERSION = 1

-- type: "bool" | "int" | "enum" | "color" | "string"
M.fields = {
    ["log.level"]            = { type = "enum", values = { "debug", "info", "warn", "error" }, default = "info",
                                 label = "Log level", group = "diagnostics" },
    ["log.max_kb"]           = { type = "int", min = 64, max = 4096, default = 512,
                                 label = "Max log file size (KB)", group = "diagnostics" },
    ["log.max_files"]        = { type = "int", min = 1, max = 10, default = 3,
                                 label = "Log files kept", group = "diagnostics" },

    ["library.scan_on_start"] = { type = "bool", default = true,
                                  label = "Scan Steam libraries when Steam starts", group = "library" },

    ["sessions.enabled"]     = { type = "bool", default = true,
                                 label = "Track game sessions (stored locally)", group = "sessions" },
    ["sessions.max_history"] = { type = "int", min = 10, max = 2000, default = 500,
                                 label = "Session history size", group = "sessions" },

    ["network.ip_logging"]     = { type = "bool", default = false,
                                   label = "Log my public IP (looked up via api.ipify.org)", group = "network" },
    ["network.ip_check_minutes"] = { type = "int", min = 5, max = 1440, default = 30,
                                     label = "Check my IP every N minutes", group = "network" },

    ["privacy.share_activity"] = { type = "bool", default = false,
                                   label = "Share activity with integrations (opt-in)", group = "privacy" },

    ["ui.accent"]            = { type = "color", default = "#577999", label = "Accent color when the OEmt.club theme is off (theme colors are set in the theme's settings)", group = "appearance" },
    ["ui.reduced_motion"]    = { type = "bool", default = false, label = "Reduce motion", group = "appearance" },
    ["ui.topbar_items"]      = { type = "string", max_len = 300, default = "sessions,settings",
                                 label = "Items in Steam's top bar (comma-separated; empty = none)", group = "topbar" },
    ["ui.open_on_start"]     = { type = "bool", default = true, label = "Open OEmt.club when Steam starts", group = "appearance" },
    -- Start page: an OEmt tab or one of Steam's own pages (opened through Steam's steam:// links).
    ["ui.default_tab"]       = { type = "enum", values = { "sessions", "settings", "diagnostics", "integrations",
                                                           "steam_store", "steam_library", "steam_community", "steam_profile" },
                                 labels = { sessions = "Sessions", settings = "Settings", diagnostics = "Diagnostics",
                                            integrations = "Integrations", steam_store = "Steam Store", steam_library = "Steam Library",
                                            steam_community = "Steam Community", steam_profile = "My Steam profile" },
                                 default = "sessions", label = "Start page when Steam opens", group = "appearance" },

    -- Integrations are opt-in. Phase 1 performs detection only; enabling records consent for later phases.
    ["integrations.discord.enabled"]    = { type = "bool", default = false, label = "Discord", group = "integrations" },
    ["integrations.discord.client_id"]  = { type = "string", max_len = 20, pattern = "^%d*$", default = "",
                                           label = "Discord Application ID (from discord.com/developers; public, not a secret)", group = "integrations" },
    ["integrations.discord.idle_presence"] = { type = "bool", default = false, label = "Discord: show \"In Steam\" when no game is running", group = "integrations" },
    ["integrations.discord.show_music"] = { type = "bool", default = false, label = "Discord: show the song you are listening to", group = "integrations" },
    ["integrations.discord.invite_button"] = { type = "bool", default = true, label = "Discord: add a \"Join OEmt.club\" button (discord.gg/OEmt)", group = "integrations" },
    ["integrations.spotify.enabled"]    = { type = "bool", default = false, label = "Spotify", group = "integrations" },
    ["integrations.soundcloud.enabled"] = { type = "bool", default = false, label = "SoundCloud", group = "integrations" },
    ["integrations.insights.enabled"]   = { type = "bool", default = false, label = "Insights.gg", group = "integrations" },
    ["integrations.insights.auto_start"] = { type = "bool", default = false, label = "Insights: start Insights Capture when a game starts", group = "integrations" },
    ["integrations.insights.recordings_dir"] = { type = "string", max_len = 400, default = "",
                                              label = "Insights recordings folder (empty = Videos/Insights Capture)", group = "integrations" },
}

-- Values renamed in later versions: old -> new. Applied by check(), so loading, setting and importing
-- all accept the old value and store the new one.
M.migrations = {
    ["ui.default_tab"] = { netsessions = "sessions", network = "sessions", performance = "diagnostics",
                         accounts = "sessions", home = "sessions", library = "sessions" },
}

-- Settings that earlier versions had and this one dropped; they are deleted from the store on load.
M.removed = {
    ["integrations.tcno.enabled"] = true,       -- TcNo integration removed
    ["integrations.discord.store_button"] = true, -- replaced by integrations.discord.invite_button
    ["accounts.ttl_avatar_min"] = true,         -- account cache moved to the separate Accounts build
    ["accounts.ttl_profile_min"] = true,
    ["accounts.ttl_status_min"] = true,
    ["accounts.ttl_cooldown_min"] = true,
}

function M.migrate(key, value)
    local m = M.migrations[key]
    if m and type(value) == "string" and m[value] then return m[value] end
    return value
end

function M.defaults()
    local out = {}
    for k, f in pairs(M.fields) do out[k] = f.default end
    return out
end

--- Validate one value. Returns ok, coerced_value_or_error_message.
function M.check(key, value)
    local f = M.fields[key]
    if not f then return false, "unknown setting" end
    value = M.migrate(key, value)
    local t = f.type
    if t == "bool" then
        if type(value) == "boolean" then return true, value end
        if value == "true" then return true, true end
        if value == "false" then return true, false end
        return false, "expected boolean"
    elseif t == "int" then
        local n = tonumber(value)
        if not n or n ~= n then return false, "expected number" end
        if n % 1 ~= 0 then return false, "expected whole number" end
        if f.min and n < f.min then return false, string.format("must be >= %d", f.min) end
        if f.max and n > f.max then return false, string.format("must be <= %d", f.max) end
        return true, n
    elseif t == "enum" then
        for _, v in ipairs(f.values) do if v == value then return true, value end end
        return false, "must be one of: " .. table.concat(f.values, ", ")
    elseif t == "color" then
        if type(value) == "string" and value:match("^#%x%x%x%x%x%x$") then return true, value:lower() end
        return false, "expected #rrggbb color"
    elseif t == "string" then
        if type(value) ~= "string" then return false, "expected string" end
        if f.max_len and #value > f.max_len then return false, "too long" end
        if f.pattern and not value:match(f.pattern) then return false, "invalid format" end
        return true, value
    end
    return false, "unsupported type"
end

--- Public description for the UI (no functions, stable ordering).
function M.describe()
    local keys = {}
    for k in pairs(M.fields) do keys[#keys + 1] = k end
    table.sort(keys)
    local out = {}
    for _, k in ipairs(keys) do
        local f = M.fields[k]
        out[#out + 1] = { key = k, type = f.type, default = f.default, min = f.min, max = f.max,
                          values = f.values, labels = f.labels, label = f.label, group = f.group }
    end
    return out
end

return M
