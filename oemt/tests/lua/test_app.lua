-- End-to-end tests for the composition root: boots app.new() with stub Steam data and a real
-- temporary data folder, then exercises every app.api.* call and the ffi.lua envelopes.
local App = require("app")
local util = require("core.util")
local json = require("core.jsonlite")
local S = require("stubs")

local is_windows = package.config:sub(1, 1) == "\\"

local function mkdirs(p)
    if is_windows then
        os.execute('mkdir "' .. p:gsub("/", "\\") .. '" >NUL 2>&1')
    else
        os.execute("mkdir -p '" .. p .. "'")
    end
    return true
end

local function boot(overrides)
    local v = S.vfs(S.steam_layout())
    local data_dir = T.tmpdir()
    local services = {
        platform = S.windows(),
        millennium_version = "3.5.0",
        steam_path = "C:/Steam",
        data_dir = data_dir,
        config_store = S.config_store(),
        mirror_logger = S.mirror(),
        getenv = function() return nil end,
        -- Steam files come from the stub layout; OEmt's own files live in the real temp folder.
        read_file = function(p)
            local c = v.read_file(p)
            if c then return c end
            return util.read_file(p)
        end,
        list_dir = v.list_dir,
        exists = v.exists,
        mkdirs = mkdirs,
        dir_writable = function(dir)
            local probe = util.join(dir, ".write-probe")
            local f = io.open(probe, "wb")
            if not f then return false end
            f:write("1"); f:close(); os.remove(probe)
            return true
        end,
    }
    for k, val in pairs(overrides or {}) do services[k] = val end
    return App.new(services), services
end

local function ok_data(res, what)
    T.eq(type(res), "table", what .. " returns an envelope")
    if not res.ok then error(what .. " failed: " .. tostring(res.error), 2) end
    return res.data
end

T.test("boots healthy and reports an overview", function()
    local app = boot()
    local o = ok_data(app.api.overview(), "overview")
    T.eq(o.version, App.VERSION)
    T.eq(o.health, "pass")
    T.eq(o.library.apps, 3)
    T.eq(#o.active_sessions, 0)
    T.eq(o.settings.accent, "#577999")
    App.shutdown(app)
end)

T.test("library lists scanned games", function()
    local app = boot()
    local lib = ok_data(app.api.library(true), "library")
    T.eq(#lib.apps, 3)
    T.eq(#lib.libraries, 3)
    T.truthy(lib.scan_ms ~= nil, "scan time measured")
end)

T.test("prepare_launch refuses games whose files are missing", function()
    local app = boot()
    local tf2 = ok_data(app.api.prepare_launch("440"), "prepare_launch 440")
    T.eq(tf2.allowed, false)
    T.contains(tf2.reason, "files were not found")
    local cs2 = ok_data(app.api.prepare_launch("730"), "prepare_launch 730")
    T.eq(cs2.allowed, true); T.eq(cs2.url, "steam://rungameid/730")
    T.eq(ok_data(app.api.prepare_launch("12345"), "unknown").allowed, false)
    T.eq(ok_data(app.api.prepare_launch("abc"), "invalid").reason, "Invalid app id")
end)

T.test("record_launch validates the outcome and errors are counted", function()
    local app = boot()
    ok_data(app.api.record_launch("730", "requested", ""), "record_launch")
    local bad = app.api.record_launch("730", "exploded", "")
    T.eq(bad.ok, false); T.contains(bad.error, "unknown launch outcome")
    T.eq(app.metrics.calls.record_launch.count, 2)
    T.eq(app.metrics.calls.record_launch.errors, 1)
end)

T.test("full session flow: start, stop, history, persisted file, clear", function()
    local app, services = boot()
    local started = ok_data(app.api.session_event(730, 7, true), "start")
    T.eq(started.tracked, true)
    local s = ok_data(app.api.sessions(10), "sessions")
    T.eq(#s.active, 1); T.eq(s.active[1].name, "Counter-Strike 2"); T.eq(s.enabled, true)
    T.eq(#ok_data(app.api.overview(), "overview").active_sessions, 1)

    local stopped = ok_data(app.api.session_event(730, 7, false), "stop")
    T.eq(stopped.tracked, true)
    s = ok_data(app.api.sessions(10), "sessions")
    T.eq(#s.active, 0); T.eq(#s.history, 1); T.eq(s.history[1].status, "ended")

    local saved = util.read_file(util.join(services.data_dir, "sessions.json"))
    T.truthy(saved, "sessions.json written to the data folder")
    T.eq(json.decode(saved).format, "oemt-sessions")

    ok_data(app.api.clear_sessions(), "clear_sessions")
    T.eq(#ok_data(app.api.sessions(10), "sessions").history, 0)
end)

T.test("session events are ignored when tracking is disabled", function()
    local app = boot({ config_store = S.config_store({ ["sessions.enabled"] = false }) })
    local r = ok_data(app.api.session_event(730, 1, true), "start")
    T.eq(r.tracked, false); T.contains(r.reason, "disabled")
end)

T.test("integrations are listed as detection-only", function()
    local app = boot()
    local list = ok_data(app.api.integrations(true), "integrations")
    T.truthy(#list > 0)
    for _, i in ipairs(list) do T.eq(i.detection.installed, false, i.id .. " not installed in the stub") end
end)

T.test("settings: get, set, reject invalid, export/import, reset", function()
    local app = boot()
    local st = ok_data(app.api.settings(), "settings")
    T.eq(st.values["ui.accent"], "#577999"); T.truthy(st.schema)
    T.eq(ok_data(app.api.set_setting("ui.accent", "#112233"), "set").value, "#112233")
    T.eq(app.api.set_setting("ui.accent", "red").ok, false)
    T.eq(app.api.set_setting("no.such.key", 1).ok, false)

    local exported = ok_data(app.api.export_settings(), "export")
    local other = boot()
    local imported = ok_data(other.api.import_settings(exported), "import")
    T.eq(#imported.rejected, 0)
    T.eq(ok_data(other.api.settings(), "settings").values["ui.accent"], "#112233")
    T.eq(other.api.import_settings("not json").ok, false)

    local reset = ok_data(app.api.reset_settings(""), "reset all")
    T.eq(reset["ui.accent"], "#577999")
end)

T.test("self-test passes against a real data folder", function()
    local app = boot()
    local r = ok_data(app.api.self_test(), "self_test")
    local failed = {}
    for _, x in ipairs(r.results) do if not x.ok then failed[#failed + 1] = x.name .. ": " .. x.detail end end
    T.eq(r.passed, r.total, table.concat(failed, "; "))
end)

T.test("diagnostics report, logs and frontend logging", function()
    local app = boot()
    local d = ok_data(app.api.diagnostics(), "diagnostics")
    T.eq(d.overall, "pass"); T.truthy(#d.modules >= 4)
    T.truthy(d.performance.startup_ms ~= nil)
    ok_data(app.api.frontend_log("warn", "ui_test", "hello from the frontend"), "frontend_log")
    ok_data(app.api.frontend_log("not-a-level", "x", "y"), "frontend_log bad level")
    local logs = ok_data(app.api.logs(500, "debug"), "logs")
    local found = false
    for _, l in ipairs(logs) do if l.event == "ui_test" and l.module == "frontend" then found = true end end
    T.truthy(found, "frontend log line recorded")
end)

T.test("diagnostics export is redacted", function()
    local app = boot()
    app.log:info({ module = "test", event = "secret_probe", msg = "token=abc123supersecret Bearer xyz987tokenvalue" })
    local text = ok_data(app.api.export_diagnostics('{"ua":"test","api_key":"k-should-vanish"}'), "export")
    local doc = json.decode(text)
    T.eq(doc.format, "oemt-diagnostics")
    T.not_contains(text, "abc123supersecret")
    T.not_contains(text, "xyz987tokenvalue")
    T.not_contains(text, "k-should-vanish")
    for _, var in ipairs({ "USERPROFILE", "HOME" }) do
        local home = os.getenv(var)
        if home and #home > 3 then
            T.not_contains(text, home, var .. " path leaked")
            T.not_contains(text, (home:gsub("\\", "/")), var .. " path leaked")
        end
    end
end)

T.test("the FFI module name does not collide with LuaJIT's built-in ffi", function()
    package.loaded["oemt_ffi"] = nil
    require("oemt_ffi")
    T.eq(type(OEmtGetOverview), "function")
end)

T.test("ffi globals return the boot-error envelope when the app failed to start", function()
    local saved_app, saved_err = OEMT_APP, OEMT_BOOT_ERROR
    OEMT_APP, OEMT_BOOT_ERROR = nil, "simulated boot failure"
    package.loaded["oemt_ffi"] = nil
    require("oemt_ffi")
    local r = OEmtGetOverview()
    T.eq(r.ok, false); T.contains(r.error, "simulated boot failure")

    OEMT_APP = boot()
    T.eq(OEmtGetOverview().ok, true)
    T.eq(OEmtPrepareLaunch("440").data.allowed, false)
    OEMT_APP, OEMT_BOOT_ERROR = saved_app, saved_err
end)

T.test("IP log: skipped while off, recorded and persisted when on", function()
    local get = function() return { status = 200, body = '{"ip":"203.0.113.7"}' } end
    local app, services = boot({ http_get = get })
    T.eq(ok_data(app.api.ip_check("manual"), "ip_check off").skipped, true)
    T.eq(ok_data(app.api.ip_log(10), "ip_log").enabled, false)

    ok_data(app.api.set_setting("network.ip_logging", true), "enable")
    T.eq(ok_data(app.api.ip_check("auto"), "ip_check").ip, "203.0.113.7")
    local s = ok_data(app.api.ip_check("session_start", "730"), "session ip").session
    T.eq(s.name, "Counter-Strike 2"); T.eq(s.ip, "203.0.113.7")
    local l = ok_data(app.api.ip_log(10), "ip_log")
    T.eq(l.current.ip, "203.0.113.7"); T.eq(#l.sessions, 1)
    T.truthy(util.read_file(util.join(services.data_dir, "ip_log.json")), "ip_log.json saved")
    T.not_contains(ok_data(app.api.export_diagnostics(""), "export"), "203.0.113.7")
    ok_data(app.api.ip_clear(), "clear")
    T.eq(#ok_data(app.api.ip_log(10), "ip_log").changes, 0)
end)

T.test("boot survives an unwritable data folder", function()
    local app = boot({ mkdirs = function() return nil end, dir_writable = function() return false end })
    local o = ok_data(app.api.overview(), "overview")
    T.eq(o.health, "fail", "data_dir check fails instead of crashing")
    local st = ok_data(app.api.self_test(), "self_test")
    T.truthy(st.passed < st.total, "self-test reports the problem")
end)
