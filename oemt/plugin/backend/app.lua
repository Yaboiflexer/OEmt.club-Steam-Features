-- OEmt composition root. Everything platform-specific arrives through `services`, so the whole
-- application can be booted under plain LuaJIT in tests with stub services.
local util         = require("core.util")
local Log          = require("core.log")
local Config       = require("core.config")
local Events       = require("core.events")
local Registry     = require("core.registry")
local schema       = require("core.schema")
local caps         = require("core.capabilities")
local json         = require("core.jsonlite")
local library_mod  = require("modules.steam_library")
local Sessions     = require("modules.sessions")
local integrations = require("modules.integrations")
local diagnostics  = require("modules.diagnostics")

local M = {}

M.VERSION = "0.1.0"

--- services: {
---   millennium_version, cmp_version?, steam_path, data_dir, config_store, mirror_logger?,
---   read_file, list_dir, exists, mkdirs, dir_writable, getenv, platform, clock? }
function M.new(services)
    local app = { services = services }
    local t0 = os.clock()

    app.metrics = { started_at = os.time(), calls = {}, startup_ms = nil }

    local data_dir = services.data_dir
    local data_ok = false
    if data_dir and services.mkdirs then
        local ok, res = pcall(services.mkdirs, util.join(data_dir, "logs"))
        data_ok = ok and res ~= nil -- fs.create_directories: true created, false existed, nil error
    end

    app.log = Log.new({ level = "info", mirror = services.mirror_logger,
                        file_path = (data_dir and data_ok) and util.join(data_dir, "logs", "oemt.log") or nil })
    app.events = Events.new(app.log)
    app.config = Config.new(services.config_store, app.log)
    app.config:load()

    local function apply_log_settings()
        app.log:set_level(app.config:get("log.level"))
        app.log:configure_file(app.log.file_path, app.config:get("log.max_kb") * 1024, app.config:get("log.max_files"))
    end
    apply_log_settings()

    app.checks = caps.probe({
        platform = services.platform, millennium_version = services.millennium_version,
        cmp_version = services.cmp_version, steam_path = services.steam_path, data_dir = data_dir,
        file_exists = services.exists, dir_writable = services.dir_writable,
    })
    for _, c in ipairs(app.checks) do
        app.log:log(c.status == "fail" and "error" or (c.status == "warn" and "warn" or "info"),
            { module = "startup", event = "check", outcome = c.status, data = { check = c.id }, msg = c.detail })
    end

    local ctx = { log = app.log, config = app.config, events = app.events, steam_path = services.steam_path,
                  data_dir = data_dir, metrics = app.metrics, version = M.VERSION,
                  millennium_version = services.millennium_version, checks = app.checks }
    app.ctx = ctx
    app.registry = Registry.new(ctx)
    ctx.registry = app.registry

    -- core module: config (always on)
    app.registry:register({
        id = "config", name = "Configuration", version = M.VERSION,
        start = function(c)
            c.config:on_change(function(k)
                if k:match("^log%.") then apply_log_settings() end
                c.events:emit("config.changed", { key = k })
            end)
        end,
        health = function(c)
            local n = #(c.config.issues or {})
            return { status = n == 0 and "ok" or "degraded", detail = n == 0 and "All settings valid" or (n .. " setting(s) repaired at load") }
        end,
    })

    -- Steam library
    local lib = library_mod.module({ read_file = services.read_file, list_dir = services.list_dir, exists = services.exists })
    app.library = lib
    ctx.library_state = lib.state
    app.registry:register(lib)

    -- Sessions
    app.sessions = Sessions.new({
        log = app.log, clock = services.clock, max_history = app.config:get("sessions.max_history"),
        lookup_name = function(appid) local a = lib.find(appid) return a and a.name or nil end,
        store = (data_dir and data_ok) and {
            load = function() return services.read_file(util.join(data_dir, "sessions.json")) end,
            save = function(text) return util.write_file_atomic(util.join(data_dir, "sessions.json"), text) end,
            backup = function()
                local p = util.join(data_dir, "sessions.json")
                os.remove(p .. ".corrupt")
                os.rename(p, p .. ".corrupt")
            end,
        } or nil,
    })
    app.registry:register({
        id = "sessions", name = "Game Sessions", version = M.VERSION, deps = { "config", "steam_library" },
        enabled = function(c) return c.config:get("sessions.enabled") end,
        init = function() app.sessions:load() end,
        start = function(c)
            c.config:on_change(function(k, v) if k == "sessions.max_history" then app.sessions:set_max_history(v) end end)
        end,
        health = function()
            if app.sessions.save_error then return { status = "degraded", detail = "Cannot save history: " .. app.sessions.save_error } end
            if app.sessions.load_error then return { status = "degraded", detail = app.sessions.load_error } end
            return { status = "ok", detail = #app.sessions.history .. " sessions recorded" }
        end,
    })

    -- Integrations (detection only in Phase 1)
    app.integrations = integrations.module({ getenv = services.getenv, exists = services.exists, platform = services.platform })
    app.registry:register(app.integrations)

    app.registry:start_all()
    app.metrics.startup_ms = (os.clock() - t0) * 1000
    app.log:info({ module = "startup", event = "boot", outcome = "ok", duration_ms = app.metrics.startup_ms,
                   data = { version = M.VERSION, modules = app.registry:summary() } })

    M.attach_api(app)
    return app
end

-- API -----------------------------------------------------------------------
-- Every call returns { ok = true, data = ... } or { ok = false, error = "..." } and is timed.

local function recent_games(app, limit)
    local lib = app.library.state.last
    if not lib then return util.array() end
    local stats = app.sessions:stats_by_app()
    local list = {}
    for _, a in ipairs(lib.apps) do
        local s = stats[a.appid]
        local last = math.max(a.last_played or 0, s and s.last_at or 0)
        if last > 0 then
            list[#list + 1] = { appid = a.appid, name = a.name, last_played = last,
                                oemt_sessions = s and s.sessions or 0, oemt_total_s = s and s.total_s or 0,
                                installed = a.installed, files_present = a.files_present }
        end
    end
    table.sort(list, function(x, y) return x.last_played > y.last_played end)
    local out = {}
    for i = 1, math.min(limit, #list) do out[i] = list[i] end
    return util.array(out)
end

function M.attach_api(app)
    local api = {}
    app.api = api

    local function wrap(name, fn)
        api[name] = function(...)
            local m = app.metrics.calls[name] or { count = 0, errors = 0, total_ms = 0, max_ms = 0 }
            app.metrics.calls[name] = m
            local ok, res, ms = util.timed(fn, ...)
            m.count = m.count + 1
            m.total_ms = m.total_ms + ms
            if ms > m.max_ms then m.max_ms = ms end
            if not ok then
                m.errors = m.errors + 1
                app.log:error({ module = "api", event = name, outcome = "failed", error = res, duration_ms = ms })
                return { ok = false, error = tostring(res) }
            end
            return { ok = true, data = res }
        end
    end

    wrap("overview", function()
        local lib = app.library.state.last
        local detected = 0
        for _, i in ipairs(app.integrations.list(app.ctx)) do if i.detection.installed then detected = detected + 1 end end
        return {
            version = M.VERSION, millennium_version = app.services.millennium_version,
            health = caps.overall(app.checks), checks = app.checks,
            library = lib and { apps = #lib.apps, libraries = #lib.libraries, warnings = #lib.warnings, scanned_at = lib.scanned_at } or nil,
            active_sessions = app.sessions:active_list(),
            recent = recent_games(app, 8),
            integrations_detected = detected,
            settings = { accent = app.config:get("ui.accent"), reduced_motion = app.config:get("ui.reduced_motion"),
                         default_tab = app.config:get("ui.default_tab"), open_on_start = app.config:get("ui.open_on_start") },
        }
    end)

    wrap("library", function(refresh)
        local res, st = app.library.get(app.ctx, refresh == true)
        if not res then error(st.last_error or "library scan failed") end
        return { libraries = res.libraries, apps = res.apps, warnings = res.warnings, scanned_at = res.scanned_at, scan_ms = st.last_ms }
    end)

    --- Validate before the frontend asks Steam to launch. Steam does the actual launch.
    wrap("prepare_launch", function(appid)
        appid = tostring(appid or "")
        if not appid:match("^%d+$") then return { allowed = false, reason = "Invalid app id" } end
        local a = app.library.find(appid)
        if not a then return { allowed = false, reason = "Game is not in the scanned library. Refresh the library and try again." } end
        if a.files_present == false then
            return { allowed = false, reason = "Game files were not found at the expected location. Verify the game in Steam." }
        end
        if not a.installed then
            return { allowed = true, warning = "Steam reports this game is not fully installed; Steam will handle the update/install.", url = "steam://rungameid/" .. appid }
        end
        return { allowed = true, url = "steam://rungameid/" .. appid }
    end)

    wrap("record_launch", function(appid, outcome, detail)
        local allowed = { requested = true, started = true, failed = true, no_start_detected = true }
        if not allowed[outcome] then error("unknown launch outcome") end
        return app.sessions:record_launch(appid, outcome, detail)
    end)

    wrap("session_event", function(appid, instance, running)
        if not app.registry:is_running("sessions") then return { tracked = false, reason = "session tracking disabled" } end
        local s, why = app.sessions:on_lifetime(appid, instance, running == true)
        app.events:emit(running and "game.started" or "game.stopped", { appid = tostring(appid) })
        return { tracked = s ~= nil, reason = why, session = s }
    end)

    wrap("sessions", function(limit)
        limit = tonumber(limit) or 50
        return { active = app.sessions:active_list(), history = app.sessions:history_list(limit),
                 enabled = app.registry:is_running("sessions"), interrupted_on_load = app.sessions.interrupted_on_load }
    end)

    wrap("clear_sessions", function()
        local ok, err = app.sessions:clear_history()
        if not ok then error(err) end
        return true
    end)

    wrap("integrations", function(refresh) return app.integrations.list(app.ctx, refresh == true) end)

    wrap("settings", function()
        return { values = app.config:all(), schema = schema.describe(), issues = util.array(util.deep_copy(app.config.issues)) }
    end)

    wrap("set_setting", function(key, value)
        local ok, res = app.config:set(key, value)
        if not ok then error(res) end
        return { key = key, value = res }
    end)

    wrap("reset_settings", function(key)
        if key == "" then key = nil end
        local ok, failed = app.config:reset(key)
        if not ok then error("reset failed for " .. #failed .. " setting(s)") end
        return app.config:all()
    end)

    wrap("export_settings", function() return app.config:export() end)
    wrap("import_settings", function(text)
        local res = app.config:import(text)
        if not res.ok then error(res.error) end
        return res
    end)

    wrap("diagnostics", function() return diagnostics.report(app.ctx) end)
    wrap("logs", function(limit, min_level) return app.log:recent(tonumber(limit) or 100, min_level) end)
    wrap("self_test", function() return diagnostics.self_test(app.ctx) end)
    wrap("export_diagnostics", function(frontend_json)
        local fe = nil
        if type(frontend_json) == "string" and frontend_json ~= "" then fe = json.decode(frontend_json) end
        return diagnostics.export_bundle(app.ctx, fe)
    end)

    wrap("frontend_log", function(level, event, message)
        if not Log.LEVELS[level] then level = "info" end
        app.log:log(level, { module = "frontend", event = tostring(event or "message"):sub(1, 64), msg = tostring(message or ""):sub(1, 2000) })
        return true
    end)
end

function M.shutdown(app)
    app.log:info({ module = "startup", event = "shutdown" })
    app.registry:stop_all()
    if app.sessions then app.sessions:save() end
end

return M
