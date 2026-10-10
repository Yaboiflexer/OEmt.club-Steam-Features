local Insights = require("modules.insights")

local LOCAL = "C:/Users/me/AppData/Local"
local EXE = LOCAL .. "/Programs/Insights Capture V3/Insights Capture.exe"
local REC = "C:/Users/me/Videos/Insights Capture"

local function config(values) return { get = function(_, k) return values[k] end } end

local function make(opts)
    opts = opts or {}
    local ran = {}
    local now = { t = opts.now or 10000 }
    local files = opts.files or {
        { path = REC .. "/CS2/clip1.mp4", name = "clip1.mp4", size = 1000, mtime = 9100 },
        { path = REC .. "/CS2/clip2.mp4", name = "clip2.mp4", size = 2000, mtime = 9500 },
        { path = REC .. "/notes.txt", name = "notes.txt", size = 10, mtime = 9600 },
        { path = REC .. "/old.mkv", name = "old.mkv", size = 3000, mtime = 1000 },
    }
    local scans = { n = 0 }
    local values = opts.values or { ["integrations.insights.enabled"] = true }
    local ins = Insights.new({
        getenv = function(k) return ({ LOCALAPPDATA = LOCAL, USERPROFILE = "C:/Users/me" })[k] end,
        exists = function(p) return p == EXE or (opts.exists and opts.exists[p]) end,
        exec = function(cmd) ran[#ran + 1] = cmd return "", 0 end,
        scan_files = function(dir, depth) scans.n = scans.n + 1; scans.dir = dir; scans.depth = depth; return files end,
        win32 = { running = function() return opts.running and { ["insights capture.exe"] = true } or {} end },
        config = config(values),
        clock = function() return now.t end,
    })
    return ins, ran, now, scans, values
end

T.test("finds the installed app and whether it runs", function()
    local ins = make({ running = true })
    local inst = ins:install()
    T.eq(inst.path, EXE); T.eq(inst.variant, "Insights Capture V3")
    T.eq(ins:running(), true)
    local off = make({ running = false })
    T.eq(off:running(), false)
end)

T.test("not installed: open fails with a clear message", function()
    local ins = Insights.new({ getenv = function() return LOCAL end, exists = function() return false end, exec = function() end,
                               config = config({}), clock = os.time })
    T.eq(ins:install(), nil)
    local ok, err = ins:open()
    T.eq(ok, nil); T.contains(err, "not installed")
end)

T.test("recordings: only video files, newest first, default folder, cached briefly", function()
    local ins, _, now, scans = make()
    local recs = ins:recordings()
    T.eq(#recs, 3, "notes.txt skipped")
    T.eq(recs[1].name, "clip2.mp4"); T.eq(recs[3].name, "old.mkv")
    T.eq(scans.dir, REC); T.eq(scans.depth, 3)
    ins:recordings()
    T.eq(scans.n, 1, "second call within 30 s uses the cache")
    now.t = now.t + 31
    ins:recordings()
    T.eq(scans.n, 2)
    ins:recordings(true)
    T.eq(scans.n, 3, "force rescans")
end)

T.test("custom recordings folder from settings", function()
    local ins, _, _, scans = make({ values = { ["integrations.insights.enabled"] = true, ["integrations.insights.recordings_dir"] = "D:/Clips" } })
    ins:recordings()
    T.eq(scans.dir, "D:/Clips")
end)

T.test("clips match the session window plus a 5-minute grace", function()
    local ins = make()
    local clips = ins:clips_for({ started_at = 9000, ended_at = 9200 })
    T.eq(#clips, 2, "9100 inside, 9500 within 300 s grace")
    T.eq(#ins:clips_for({ started_at = 9000, ended_at = 9050 }), 1, "9500 is past the grace")
    T.eq(#ins:clips_for({ started_at = 9400 }), 1, "running session: up to now + grace")
    T.eq(#ins:clips_for(nil), 0)
end)

T.test("open starts the app detached; auto-start only when enabled, not running, and not too often", function()
    local ins, ran, now = make({ values = { ["integrations.insights.enabled"] = true, ["integrations.insights.auto_start"] = true } })
    T.truthy(ins:open())
    T.contains(ran[1], 'start ""')
    T.contains(ran[1], "Insights Capture.exe")
    now.t = now.t + 200
    T.truthy(ins:on_game_started())
    T.eq(#ran, 2)
    T.falsy(ins:on_game_started(), "cooldown after a start")
    local running = make({ running = true, values = { ["integrations.insights.enabled"] = true, ["integrations.insights.auto_start"] = true } })
    T.falsy(running:on_game_started(), "already running")
    local manual = make({ values = { ["integrations.insights.enabled"] = true } })
    T.falsy(manual:on_game_started(), "auto-start off")
end)

T.test("reveal only opens files inside the recordings folder", function()
    local ins, ran = make({ exists = { [REC .. "/CS2/clip1.mp4"] = true } })
    T.truthy(ins:reveal(REC .. "/CS2/clip1.mp4"))
    T.contains(ran[#ran], "explorer.exe /select,")
    T.truthy(ins:reveal(nil))
    T.contains(ran[#ran], "Insights Capture")
    local ok, err = ins:reveal("C:/Windows/System32/cmd.exe")
    T.eq(ok, nil); T.contains(err, "not in the recordings folder")
    local ok2 = ins:reveal(REC .. "/../../secret.txt")
    T.eq(ok2, nil, "no climbing out with ..")
    local ok3, err3 = ins:reveal(REC .. "/gone.mp4")
    T.eq(ok3, nil); T.contains(err3, "no longer exists")
    local before = #ran
    ins:reveal('C:/Users/me/Videos/Insights Capture/x" & calc & ".mp4')
    T.eq(#ran, before, "quotes in a path never reach the command line")
end)

T.test("status: installed, running, recordings (only when enabled)", function()
    local ins = make({ running = true })
    local st = ins:status()
    T.truthy(st.installed); T.eq(st.running, true); T.eq(st.recordings_total, 3)
    T.eq(st.recordings[1].name, "clip2.mp4")
    local off = make({ values = {} })
    local st2 = off:status()
    T.eq(st2.recordings_total, 0, "folder not scanned while the integration is off")
end)
