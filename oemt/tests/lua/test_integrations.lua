local integ = require("modules.integrations")
local Config = require("core.config")
local Log = require("core.log")
local S = require("stubs")

local env = { LOCALAPPDATA = "C:/Users/zy/AppData/Local", APPDATA = "C:/Users/zy/AppData/Roaming", ProgramFiles = "C:/Program Files" }
local function getenv(k) return env[k] end

local function ctx()
    local c = Config.new(S.config_store(), Log.new()); c:load()
    return { config = c, log = Log.new() }
end

T.test("detects installed apps from standard locations only", function()
    local present = { ["C:/Users/zy/AppData/Local/DiscordPTB/Update.exe"] = true, ["C:/Program Files/TcNo Account Switcher/TcNo-Acc-Switcher.exe"] = true }
    local mod = integ.module({ getenv = getenv, exists = function(p) return present[p] == true end, platform = S.windows() })
    local c = ctx()
    local by = {}
    for _, i in ipairs(mod.list(c)) do by[i.id] = i end
    T.eq(by.discord.detection.status, "detected"); T.eq(by.discord.detection.variant, "PTB")
    T.eq(by.tcno.detection.status, "detected")
    T.eq(by.spotify.detection.status, "not_installed")
    T.eq(by.soundcloud.detection.status, "not_detectable")
    T.falsy(by.discord.enabled, "integrations are opt-in")
end)

T.test("no integration claims an available capability in Phase 1", function()
    for _, def in ipairs(integ.DEFINITIONS) do
        for _, cap in ipairs(def.capabilities) do
            T.truthy(cap.status == "planned" or cap.status == "unsupported", def.id .. "." .. cap.id)
        end
    end
end)

T.test("enabled flag follows settings and cache invalidates", function()
    local mod = integ.module({ getenv = getenv, exists = function() return false end, platform = S.windows() })
    local c = ctx()
    mod.start(c)
    T.falsy(mod.list(c)[1].enabled)
    c.config:set("integrations.discord.enabled", true)
    T.truthy(mod.list(c)[1].enabled)
end)

T.test("non-Windows platforms report unsupported instead of guessing", function()
    local mod = integ.module({ getenv = getenv, exists = function() return true end, platform = { os = "Linux", is_windows = false } })
    T.eq(mod.list(ctx())[1].detection.status, "unsupported_platform")
end)
