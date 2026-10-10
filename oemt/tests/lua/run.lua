-- OEmt backend test runner. Usage (from repo root):
--   luajit oemt/tests/lua/run.lua            -- run all tests
--   luajit oemt/tests/lua/run.lua config     -- run test files whose name contains "config"
-- Exit code is non-zero when any test fails.
local script_dir = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = script_dir .. "/../.."
package.path = table.concat({
    root .. "/plugin/backend/?.lua",
    script_dir .. "/?.lua",
    package.path,
}, ";")

local T = { passed = 0, failed = 0, failures = {}, current = "" }
_G.T = T

local function fmt(v)
    if type(v) == "string" then return string.format("%q", v) end
    return tostring(v)
end

function T.test(name, fn)
    local full = T.current .. " :: " .. name
    local ok, err = xpcall(fn, debug.traceback)
    if ok then
        T.passed = T.passed + 1
        io.write("  ok   ", name, "\n")
    else
        T.failed = T.failed + 1
        T.failures[#T.failures + 1] = { name = full, err = err }
        io.write("  FAIL ", name, "\n")
    end
end

function T.eq(actual, expected, msg)
    if actual ~= expected then
        error((msg and (msg .. ": ") or "") .. "expected " .. fmt(expected) .. ", got " .. fmt(actual), 2)
    end
end

function T.truthy(v, msg) if not v then error(msg or ("expected truthy, got " .. fmt(v)), 2) end end
function T.falsy(v, msg) if v then error(msg or ("expected falsy, got " .. fmt(v)), 2) end end

function T.contains(s, needle, msg)
    if type(s) ~= "string" or not s:find(needle, 1, true) then
        error((msg and (msg .. ": ") or "") .. "expected " .. fmt(s) .. " to contain " .. fmt(needle), 2)
    end
end

function T.not_contains(s, needle, msg)
    if type(s) == "string" and s:find(needle, 1, true) then
        error((msg and (msg .. ": ") or "") .. "expected " .. fmt(s) .. " NOT to contain " .. fmt(needle), 2)
    end
end

function T.tmpdir()
    local base = os.getenv("TMPDIR") or os.getenv("TEMP") or "/tmp"
    local dir = string.format("%s/oemt-test-%d-%d", base:gsub("\\", "/"), os.time(), math.random(1, 1e9))
    local sep = package.config:sub(1, 1)
    if sep == "\\" then os.execute('mkdir "' .. dir:gsub("/", "\\") .. '" >NUL 2>&1')
    else os.execute("mkdir -p '" .. dir .. "'") end
    return dir
end

local files = {
    "test_jsonlite", "test_redact", "test_vdf", "test_schema_config", "test_log", "test_events_registry",
    "test_capabilities", "test_steam_library", "test_sessions", "test_integrations", "test_app",
}

local filter = arg and arg[1]
math.randomseed(os.time())
for _, f in ipairs(files) do
    if not filter or f:find(filter, 1, true) then
        T.current = f
        io.write(f, "\n")
        package.loaded[f] = nil
        local ok, err = xpcall(function() require(f) end, debug.traceback)
        if not ok then
            T.failed = T.failed + 1
            T.failures[#T.failures + 1] = { name = f .. " (load)", err = err }
            io.write("  FAIL (file error)\n")
        end
    end
end

io.write(string.format("\n%d passed, %d failed\n", T.passed, T.failed))
for _, fl in ipairs(T.failures) do
    io.write("\n--- ", fl.name, "\n", tostring(fl.err), "\n")
end
os.exit(T.failed == 0 and 0 or 1)
