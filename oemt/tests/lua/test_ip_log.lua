local IpLog = require("modules.ip_log")
local redact = require("core.redact")
local json = require("core.jsonlite")

local function mem_store(initial)
    local st = { text = initial, saves = 0 }
    st.load = function() return st.text end
    st.save = function(t) st.text = t; st.saves = st.saves + 1; return true end
    st.backup = function() st.backed_up = st.text end
    return st
end

--- http stub answering with a queue of IPs (or errors).
local function lookup(...)
    local answers, calls = { ... }, { n = 0 }
    local fn = function(url)
        calls.n = calls.n + 1
        calls.url = url
        local a = table.remove(answers, 1)
        if a == nil then return nil, "offline" end
        if type(a) == "number" then return { status = a, body = "" } end
        return { status = 200, body = json.encode({ ip = a }) }
    end
    return fn, calls
end

T.test("validates IPv4 and IPv6", function()
    T.truthy(IpLog.valid_ip("203.0.113.7")); T.truthy(IpLog.valid_ip("2001:db8::1"))
    T.falsy(IpLog.valid_ip("999.1.1.1")); T.falsy(IpLog.valid_ip("hello")); T.falsy(IpLog.valid_ip(nil))
end)

T.test("records a change only when the IP differs", function()
    local t = 100
    local get, calls = lookup("203.0.113.7", "203.0.113.7", "198.51.100.9")
    local log = IpLog.new({ http_get = get, store = mem_store(), clock = function() return t end })
    T.eq(log:check("startup").changed, true)
    t = 200
    T.eq(log:check("auto").changed, false)
    T.eq(#log.changes, 1); T.eq(log.changes[1].last_seen, 200); T.eq(log.changes[1].checks, 2)
    t = 300
    local r = log:check("auto")
    T.eq(r.changed, true); T.eq(r.ip, "198.51.100.9"); T.eq(#log.changes, 2)
    T.eq(calls.url, IpLog.LOOKUP_URL)
end)

T.test("lookup failures are reported and change nothing", function()
    local log = IpLog.new({ http_get = lookup(503), store = mem_store() })
    local r, err = log:check("auto")
    T.eq(r, nil); T.contains(err, "503"); T.eq(#log.changes, 0)
    local log2 = IpLog.new({ http_get = lookup(), store = mem_store() })
    local _, err2 = log2:check("auto")
    T.eq(err2, "offline")
end)

T.test("session start records the IP, falling back to the last known one", function()
    local get = lookup("203.0.113.7") -- second lookup fails
    local log = IpLog.new({ http_get = get, store = mem_store(), clock = function() return 5 end })
    local a = log:session_start("730", "Counter-Strike 2")
    T.eq(a.ip, "203.0.113.7"); T.eq(a.fresh, true); T.eq(a.name, "Counter-Strike 2")
    local b = log:session_start("730")
    T.eq(b.ip, "203.0.113.7"); T.eq(b.fresh, false)
    T.eq(#log.sessions, 2)
end)

T.test("persists, reloads, lists newest first and clears", function()
    local store = mem_store()
    local t = 0
    local log = IpLog.new({ http_get = lookup("203.0.113.1", "203.0.113.2"), store = store, clock = function() t = t + 1 return t end })
    log:check("startup"); log:check("auto")
    local again = IpLog.new({ store = store })
    again:load()
    T.eq(#again.changes, 2)
    local l = again:list(10)
    T.eq(l.changes[1].ip, "203.0.113.2"); T.eq(l.current.ip, "203.0.113.2")
    T.truthy(again:clear()); T.eq(#again:list(10).changes, 0)
end)

T.test("corrupt file is set aside", function()
    local store = mem_store("{ nope")
    local log = IpLog.new({ store = store })
    log:load()
    T.eq(store.backed_up, "{ nope"); T.truthy(log.load_error)
end)

T.test("redaction hides IPs but keeps timestamps and versions with fewer parts", function()
    T.eq(redact.string("ip 203.0.113.7 seen"), "ip [ip] seen")
    T.eq(redact.string("v6 2001:db8:0:1::1 here"), "v6 [ip] here")
    T.eq(redact.string("loopback ::1"), "loopback [ip]")
    T.eq(redact.string("2026-10-10T05:42:42Z"), "2026-10-10T05:42:42Z")
    T.eq(redact.string("Millennium v3.5.0"), "Millennium v3.5.0")
end)
