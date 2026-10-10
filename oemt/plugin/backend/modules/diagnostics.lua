-- Health report, runtime self-test, performance snapshot and redacted export bundle.
local util   = require("core.util")
local json   = require("core.jsonlite")
local redact = require("core.redact")
local vdf    = require("core.vdf")
local schema = require("core.schema")
local caps   = require("core.capabilities")

local M = {}

local SAMPLE_VDF = [["AppState" { "appid" "1" "name" "Self Test" "StateFlags" "4" }]]

--- Runtime self-test. ctx: { config, log, registry, data_dir }
function M.self_test(ctx)
    local results = {}
    local function run(name, fn)
        local ok, detail, ms = util.timed(fn)
        results[#results + 1] = { name = name, ok = ok and detail ~= false, detail = (ok and detail ~= false) and tostring(detail or "ok") or tostring(detail), duration_ms = ms }
    end

    run("settings schema defaults are valid", function()
        for k, f in pairs(schema.fields) do
            local ok, e = schema.check(k, f.default)
            if not ok then error(k .. ": " .. e) end
        end
        return "all defaults pass validation"
    end)

    run("settings export round-trip", function()
        local doc = json.decode(ctx.config:export())
        if type(doc) ~= "table" or type(doc.settings) ~= "table" then error("export did not decode") end
        for k, v in pairs(ctx.config:all()) do
            if doc.settings[k] ~= v then error("mismatch on " .. k) end
        end
        return "export decodes and matches live settings"
    end)

    run("VDF parser", function()
        local d, e = vdf.parse(SAMPLE_VDF)
        if not d then error(e) end
        if vdf.get(vdf.get(d, "AppState"), "name") ~= "Self Test" then error("unexpected parse result") end
        return "ok"
    end)

    run("data folder writable", function()
        if not ctx.data_dir then error("no data folder configured") end
        local probe = util.join(ctx.data_dir, ".selftest")
        local ok, err = util.write_file_atomic(probe, "oemt")
        if not ok then error(err) end
        local back = util.read_file(probe)
        os.remove(probe)
        if back ~= "oemt" then error("read-back mismatch") end
        return "write, read-back and delete succeeded"
    end)

    run("log file sink", function()
        local st = ctx.log:status()
        if not st.file_path then error("file logging is not configured") end
        local errors_before = st.file_errors
        ctx.log:info({ module = "diagnostics", event = "self_test_marker" })
        local st2 = ctx.log:status()
        if st2.file_errors > errors_before or st2.file_errors >= 5 then
            error("log sink write failed: " .. tostring(st2.last_file_error))
        end
        if ctx.log:disk_usage() <= 0 then error("log file is empty after write") end
        return "record written (" .. ctx.log:disk_usage() .. " bytes on disk)"
    end)

    run("core modules running", function()
        local bad = {}
        for _, h in ipairs(ctx.registry:health()) do
            if h.state ~= "started" and h.state ~= "disabled" then bad[#bad + 1] = h.id .. "=" .. h.state end
        end
        if #bad > 0 then error("not running: " .. table.concat(bad, ", ")) end
        return "all enabled modules started"
    end)

    local passed = 0
    for _, r in ipairs(results) do if r.ok then passed = passed + 1 end end
    ctx.log:log(passed == #results and "info" or "warn",
        { module = "diagnostics", event = "self_test", outcome = passed == #results and "ok" or "failed", data = { passed = passed, total = #results } })
    return { passed = passed, total = #results, results = util.array(results), ran_at = util.iso_now() }
end

--- Real measurements only. ctx.metrics is maintained by the FFI wrapper in main.lua.
function M.performance(ctx)
    local calls = {}
    for name, m in pairs(ctx.metrics.calls) do
        calls[#calls + 1] = { name = name, count = m.count, errors = m.errors,
                              avg_ms = m.count > 0 and (math.floor(m.total_ms / m.count * 100) / 100) or 0,
                              max_ms = math.floor(m.max_ms * 100) / 100 }
    end
    table.sort(calls, function(a, b) return a.name < b.name end)
    return {
        backend_heap_kb = math.floor(collectgarbage("count") * 10) / 10,
        uptime_s = os.time() - ctx.metrics.started_at,
        startup_ms = ctx.metrics.startup_ms,
        log_disk_bytes = ctx.log:disk_usage(),
        calls = util.array(calls),
        library_scan_ms = ctx.library_state and ctx.library_state.last_ms or nil,
        note = "Backend figures are measured inside the OEmt Lua process. CPU/GPU/FPS are not measured in Phase 1.",
    }
end

function M.report(ctx)
    local checks = ctx.checks or {}
    return {
        oemt_version = ctx.version,
        millennium_version = ctx.millennium_version,
        platform = util.platform(),
        overall = caps.overall(checks),
        checks = checks,
        modules = ctx.registry:health(),
        config_issues = util.array(util.deep_copy(ctx.config.issues or {})),
        log = ctx.log:status(),
        performance = M.performance(ctx),
        generated_at = util.iso_now(),
    }
end

--- A redacted, self-contained JSON bundle the user can copy into a bug report.
function M.export_bundle(ctx, frontend_info)
    local bundle = {
        format = "oemt-diagnostics",
        version = 1,
        report = M.report(ctx),
        settings = ctx.config:all(),
        recent_logs = ctx.log:recent(150, "debug"),
        frontend = frontend_info,
    }
    return json.encode(redact.value(bundle))
end

return M
