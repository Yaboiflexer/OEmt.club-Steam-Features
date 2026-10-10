local schema = require("core.schema")
local Config = require("core.config")
local Log = require("core.log")
local S = require("stubs")
local json = require("core.jsonlite")

T.test("every default passes its own validation", function()
    for k, f in pairs(schema.fields) do
        local ok, e = schema.check(k, f.default)
        T.truthy(ok, k .. ": " .. tostring(e))
    end
end)

T.test("type checks and coercion", function()
    T.eq(select(2, schema.check("log.max_kb", "256")), 256)
    T.falsy(schema.check("log.max_kb", 10))
    T.falsy(schema.check("log.max_kb", 100.5))
    T.falsy(schema.check("log.level", "verbose"))
    T.eq(select(2, schema.check("ui.accent", "#AABBCC")), "#aabbcc")
    T.falsy(schema.check("ui.accent", "red"))
    T.eq(select(2, schema.check("ui.reduced_motion", "true")), true)
    T.falsy(schema.check("nope", 1))
end)

T.test("load repairs invalid stored values and reports issues", function()
    local store = S.config_store({ ["log.level"] = "LOUD", ["log.max_kb"] = 1024, ["legacy.key"] = 1 })
    local c = Config.new(store, Log.new())
    local issues = c:load()
    T.eq(c:get("log.level"), "info")
    T.eq(c:get("log.max_kb"), 1024)
    T.eq(store.data["log.level"], "info", "repaired value persisted")
    T.eq(#issues, 2)
end)

T.test("unreadable store falls back to defaults", function()
    local c = Config.new({ get_all = function() error("io error") end }, Log.new())
    local issues = c:load()
    T.eq(c:get("log.level"), "info")
    T.eq(#issues, 1)
end)

T.test("set validates, persists and notifies once", function()
    local store = S.config_store()
    local c = Config.new(store, Log.new()); c:load()
    local seen = 0
    c:on_change(function() seen = seen + 1 end)
    T.truthy(c:set("ui.reduced_motion", true))
    T.truthy(c:set("ui.reduced_motion", true))
    T.eq(seen, 1)
    T.eq(store.data["ui.reduced_motion"], true)
    local ok, err = c:set("log.max_files", 99)
    T.falsy(ok); T.contains(err, "<=")
end)

T.test("set reports store failures instead of claiming success", function()
    local store = S.config_store()
    local c = Config.new(store, Log.new()); c:load()
    store.fail_set = true
    local ok, err = c:set("ui.reduced_motion", true)
    T.falsy(ok); T.contains(err, "disk full")
    T.eq(c:get("ui.reduced_motion"), false, "memory unchanged on failed save")
end)

T.test("a throwing listener does not break set", function()
    local c = Config.new(S.config_store(), Log.new()); c:load()
    c:on_change(function() error("boom") end)
    T.truthy(c:set("ui.reduced_motion", true))
end)

T.test("export/import round trip", function()
    local a = Config.new(S.config_store(), Log.new()); a:load()
    a:set("ui.accent", "#112233"); a:set("log.level", "debug")
    local b = Config.new(S.config_store(), Log.new()); b:load()
    local res = b:import(a:export())
    T.truthy(res.ok); T.eq(#res.rejected, 0)
    T.eq(b:get("ui.accent"), "#112233"); T.eq(b:get("log.level"), "debug")
end)

T.test("import rejects bad documents and bad values individually", function()
    local c = Config.new(S.config_store(), Log.new()); c:load()
    T.falsy(c:import("not json").ok)
    T.falsy(c:import('{"format":"other","settings":{}}').ok)
    T.falsy(c:import('{"format":"oemt-settings","schema_version":999,"settings":{}}').ok)
    local res = c:import(json.encode({ format = "oemt-settings", schema_version = 1,
        settings = { ["log.level"] = "warn", ["log.max_kb"] = 1, ["evil.key"] = "x" } }))
    T.truthy(res.ok); T.eq(res.applied, 1); T.eq(#res.rejected, 2)
    T.eq(c:get("log.level"), "warn"); T.eq(c:get("log.max_kb"), 512)
end)

T.test("reset restores defaults", function()
    local c = Config.new(S.config_store(), Log.new()); c:load()
    c:set("log.level", "error")
    T.truthy(c:reset("log.level")); T.eq(c:get("log.level"), "info")
    c:set("log.level", "error"); c:set("ui.accent", "#000000")
    T.truthy(c:reset()); T.eq(c:get("ui.accent"), "#577999")
    T.falsy(c:reset("missing"))
end)

T.test("old default_tab values are migrated, not reset", function()
    local schema = require("core.schema")
    T.eq(select(2, schema.check("ui.default_tab", "netsessions")), "sessions")
    T.eq(select(2, schema.check("ui.default_tab", "network")), "sessions")
    T.eq(select(2, schema.check("ui.default_tab", "performance")), "diagnostics")
    T.eq(select(2, schema.check("ui.default_tab", "accounts")), "sessions", "Accounts moved to a separate build")
    T.eq(select(2, schema.check("ui.default_tab", "home")), "sessions", "Home removed")
    T.eq(select(2, schema.check("ui.default_tab", "library")), "sessions", "OEmt Library removed")
    T.eq(select(2, schema.check("ui.default_tab", "sessions")), "sessions")
    T.falsy(schema.check("ui.default_tab", "bogus"))
end)

T.test("start page accepts OEmt tabs and Steam pages, each with a readable label", function()
    local schema = require("core.schema")
    local f = schema.fields["ui.default_tab"]
    for _, v in ipairs(f.values) do
        T.truthy(schema.check("ui.default_tab", v), v)
        T.truthy(f.labels[v], "label for " .. v)
    end
    T.truthy(schema.check("ui.default_tab", "steam_store"))
    local described
    for _, d in ipairs(schema.describe()) do if d.key == "ui.default_tab" then described = d end end
    T.eq(described.labels.steam_library, "Steam Library", "labels reach the UI")
end)

T.test("settings from earlier versions are deleted quietly, unknown ones still reported", function()
    local Config = require("core.config")
    local data = { ["integrations.tcno.enabled"] = true, ["accounts.ttl_avatar_min"] = 60, ["made.up.key"] = 1 }
    local deleted = {}
    local store = {
        get_all = function() return data end,
        set = function() return true end,
        delete = function(k) deleted[#deleted + 1] = k; data[k] = nil; return true end,
    }
    local cfg = Config.new(store, nil)
    local issues = cfg:load()
    table.sort(deleted)
    T.eq(table.concat(deleted, ","), "accounts.ttl_avatar_min,integrations.tcno.enabled")
    T.eq(#issues, 1); T.eq(issues[1].key, "made.up.key")
end)
