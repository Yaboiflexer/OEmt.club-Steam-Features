local Sessions = require("modules.sessions")
local json = require("core.jsonlite")

local function mem_store(initial)
    local st = { text = initial, saves = 0, fail = false }
    st.load = function() if st.text then return st.text end return nil, "missing" end
    st.save = function(t) if st.fail then return false, "read-only" end st.text = t; st.saves = st.saves + 1; return true end
    st.backup = function() st.backed_up = st.text end
    return st
end

local function clock_at(t) local c = { t = t } c.fn = function() return c.t end return c end

T.test("start and stop produce a session with duration", function()
    local clk, store = clock_at(1000), mem_store()
    local s = Sessions.new({ store = store, clock = clk.fn, lookup_name = function(id) return id == "730" and "Counter-Strike 2" or nil end })
    s:load()
    local started = s:on_lifetime(730, 5, true)
    T.eq(started.name, "Counter-Strike 2")
    T.eq(#s:active_list(), 1)
    clk.t = 1600
    local ended = s:on_lifetime(730, 5, false)
    T.eq(ended.duration_s, 600); T.eq(ended.status, "ended")
    T.eq(#s:active_list(), 0)
    T.eq(store.saves, 2)
end)

T.test("duplicate starts and unmatched stops are handled", function()
    local s = Sessions.new({ clock = function() return 1 end })
    s:on_lifetime(1, 1, true)
    local _, why = s:on_lifetime(1, 1, true)
    T.eq(why, "already active"); T.eq(#s.history, 1)
    local r, why2 = s:on_lifetime(2, 1, false)
    T.eq(r, nil); T.eq(why2, "no matching start")
end)

T.test("appid 0 (non-Steam shortcut) is not attributed", function()
    local s = Sessions.new({})
    local r, why = s:on_lifetime(0, 1, true)
    T.eq(r, nil); T.contains(why, "unattributable")
end)

T.test("history persists and open sessions become interrupted on reload", function()
    local store = mem_store()
    local a = Sessions.new({ store = store, clock = function() return 50 end })
    a:on_lifetime(10, 1, true)
    local b = Sessions.new({ store = store })
    b:load()
    T.eq(#b.history, 1); T.eq(b.history[1].status, "interrupted"); T.eq(b.interrupted_on_load, 1)
    T.eq(#b:active_list(), 0)
end)

T.test("corrupt history file is backed up, not trusted", function()
    local store = mem_store("{ broken")
    local s = Sessions.new({ store = store })
    s:load()
    T.eq(#s.history, 0); T.truthy(s.load_error); T.eq(store.backed_up, "{ broken")
end)

T.test("history is bounded", function()
    local t = 0
    local s = Sessions.new({ max_history = 10, clock = function() t = t + 1 return t end })
    for i = 1, 25 do s:on_lifetime(i, 1, true); s:on_lifetime(i, 1, false) end
    T.eq(#s.history, 10)
    T.eq(s:history_list(1)[1].appid, "25", "newest first")
    s:set_max_history(5)
    T.eq(#s.history, 5)
end)

T.test("save failures are surfaced", function()
    local store = mem_store(); store.fail = true
    local s = Sessions.new({ store = store })
    s:on_lifetime(1, 1, true)
    T.eq(s.save_error, "read-only")
end)

T.test("stats aggregate per app and launches are recorded", function()
    local t = 0
    local s = Sessions.new({ clock = function() t = t + 100 return t end })
    s:on_lifetime(7, 1, true); s:on_lifetime(7, 1, false)
    s:on_lifetime(7, 2, true); s:on_lifetime(7, 2, false)
    local st = s:stats_by_app()["7"]
    T.eq(st.sessions, 2); T.eq(st.total_s, 200)
    s:record_launch("7", "requested")
    T.eq(s.launches[1].outcome, "requested")
end)

T.test("saved file is valid JSON in the expected format", function()
    local store = mem_store()
    local s = Sessions.new({ store = store, clock = function() return 5 end })
    s:on_lifetime(3, 1, true)
    local doc = json.decode(store.text)
    T.eq(doc.format, "oemt-sessions"); T.eq(#doc.history, 1)
end)
