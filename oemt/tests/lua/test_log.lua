local Log = require("core.log")
local util = require("core.util")
local json = require("core.jsonlite")
local S = require("stubs")

T.test("level filtering and ring buffer order", function()
    local l = Log.new({ level = "info", ring_size = 3 })
    l:debug({ event = "hidden" })
    for i = 1, 5 do l:info({ event = "e" .. i }) end
    local r = l:recent(10)
    T.eq(#r, 3); T.eq(r[1].event, "e5"); T.eq(r[3].event, "e3")
    T.eq(l.stats.debug, 0)
end)

T.test("recent filters by minimum level and module", function()
    local l = Log.new({ level = "debug" })
    l:info({ module = "a", event = "x" }); l:warn({ module = "b", event = "y" }); l:error({ module = "a", event = "z" })
    T.eq(#l:recent(10, "warn"), 2)
    T.eq(#l:recent(10, "debug", "a"), 2)
end)

T.test("records are structured and redacted", function()
    local l = Log.new()
    local e = l:error({ module = "m", event = "op", cid = "c1", outcome = "failed", duration_ms = 1.23456,
                        error = "token=abc", data = { password = "p", n = 1 } })
    T.eq(e.module, "m"); T.eq(e.cid, "c1"); T.eq(e.duration_ms, 1.23)
    T.not_contains(e.error, "abc"); T.eq(e.data.password, "[redacted]"); T.eq(e.data.n, 1)
    T.truthy(e.ts:match("^%d%d%d%d%-%d%d%-%d%dT"))
end)

T.test("file sink writes JSON lines and rotates within bounds", function()
    local dir = T.tmpdir()
    local path = dir .. "/oemt.log"
    local l = Log.new({ file_path = path, max_bytes = 2048, max_files = 3 })
    for i = 1, 200 do l:info({ module = "rot", event = "line", data = { i = i, pad = string.rep("x", 40) } }) end
    local f = io.open(path, "rb"); local first = f:read("*l"); f:close()
    T.truthy(json.decode(first), "first line is valid JSON")
    T.truthy(util.file_exists(path .. ".1")); T.truthy(util.file_exists(path .. ".2"))
    T.falsy(util.file_exists(path .. ".3"), "never more than max_files")
    T.truthy(l:disk_usage() <= 2048 * 3, "disk usage bounded")
    os.remove(path); os.remove(path .. ".1"); os.remove(path .. ".2"); os.remove(dir)
end)

T.test("unwritable file path degrades without throwing", function()
    local l = Log.new({ file_path = "/nonexistent-dir-oemt/x/y.log" })
    for _ = 1, 8 do l:info({ event = "x" }) end
    local st = l:status()
    T.eq(st.file_errors, 5); T.truthy(st.dropped_file_writes >= 3); T.truthy(st.last_file_error)
    T.eq(#l:recent(100), 8, "ring buffer still works")
end)

T.test("mirrors to Millennium logger", function()
    local m = S.mirror()
    local l = Log.new({ mirror = m })
    l:warn({ module = "x", event = "y", msg = "hello" })
    T.contains(m.lines[1], "W [x] y hello")
end)

T.test("scope:op times and logs failures", function()
    local l = Log.new()
    local s = l:scope("mod")
    local ok, err = s:op("explode", function() error("bad thing") end)
    T.falsy(ok); T.contains(tostring(err), "bad thing")
    local e = l:recent(1)[1]
    T.eq(e.outcome, "failed"); T.eq(e.module, "mod"); T.truthy(e.cid); T.truthy(e.duration_ms ~= nil)
end)
