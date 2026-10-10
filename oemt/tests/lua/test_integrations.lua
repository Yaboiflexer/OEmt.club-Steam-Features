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
    local present = { ["C:/Users/zy/AppData/Local/DiscordPTB/Update.exe"] = true }
    local mod = integ.module({ getenv = getenv, exists = function(p) return present[p] == true end, platform = S.windows() })
    local c = ctx()
    local by = {}
    for _, i in ipairs(mod.list(c)) do by[i.id] = i end
    T.eq(by.discord.detection.status, "detected"); T.eq(by.discord.detection.variant, "PTB")
    T.truthy(by.discord.enabled, "Discord Rich Presence is on by default")
end)

-- Only capabilities that are actually implemented may say "available".
local IMPLEMENTED = { ["discord.rich_presence"] = true, ["discord.activity_privacy"] = true }

T.test("only implemented capabilities claim to be available", function()
    for _, def in ipairs(integ.DEFINITIONS) do
        for _, cap in ipairs(def.capabilities) do
            local id = def.id .. "." .. cap.id
            if IMPLEMENTED[id] then
                T.eq(cap.status, "available", id)
            else
                T.truthy(cap.status == "planned" or cap.status == "unsupported", id)
            end
        end
    end
end)

T.test("enabled flag follows settings and cache invalidates", function()
    local mod = integ.module({ getenv = getenv, exists = function() return false end, platform = S.windows() })
    local c = ctx()
    mod.start(c)
    T.truthy(mod.list(c)[1].enabled, "default on")
    c.config:set("integrations.discord.enabled", false)
    T.falsy(mod.list(c)[1].enabled)
end)

T.test("non-Windows platforms report unsupported instead of guessing", function()
    local mod = integ.module({ getenv = getenv, exists = function() return true end, platform = { os = "Linux", is_windows = false } })
    T.eq(mod.list(ctx())[1].detection.status, "unsupported_platform")
end)
