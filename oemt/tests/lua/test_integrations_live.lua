local Discord = require("modules.discord_rpc")
local NowPlaying = require("modules.now_playing")
local Live = require("modules.integrations_live")
local json = require("core.jsonlite")

local APP_ID = "123456789012345678"

--- Fake Discord: records what OEmt writes and answers the handshake with READY.
local function fake_discord(opts)
    opts = opts or {}
    local srv = { written = {}, opened = 0, closed = 0, inbox = "" }
    function srv.open(i)
        if opts.running == false or (opts.pipe and i ~= opts.pipe) then return nil end
        srv.opened = srv.opened + 1
        local conn = {}
        function conn.write(data)
            if opts.broken then return false end
            local frames = Discord.decode_frames(data)
            for _, f in ipairs(frames) do
                srv.written[#srv.written + 1] = f
                if f.op == Discord.OP.HANDSHAKE and opts.ready ~= false then
                    srv.inbox = srv.inbox .. Discord.encode_frame(Discord.OP.FRAME, { cmd = "DISPATCH", evt = "READY", data = { v = 1 } })
                end
            end
            return true
        end
        function conn.read_available()
            if srv.gone then return nil, "pipe closed" end
            local d = srv.inbox
            srv.inbox = ""
            return d
        end
        function conn.close() srv.closed = srv.closed + 1 end
        return conn
    end
    return srv
end

local function client(srv, now)
    return Discord.new({ open = srv.open, sleep = function() end, pid = 4242, clock = function() return now and now.t or 1000 end })
end

T.test("frames encode little-endian opcode + length + JSON and decode back, keeping partial data", function()
    local f = Discord.encode_frame(1, { a = 1 })
    T.eq(f:byte(1), 1); T.eq(f:byte(2), 0); T.eq(f:byte(5), #'{"a":1}')
    local two = f .. Discord.encode_frame(3, { b = 2 })
    local frames, rest = Discord.decode_frames(two .. f:sub(1, 5))
    T.eq(#frames, 2); T.eq(frames[1].data.a, 1); T.eq(frames[2].op, 3)
    T.eq(#rest, 5, "incomplete frame kept for the next read")
end)

T.test("Application ID must be 17-20 digits", function()
    T.truthy(Discord.valid_client_id(APP_ID))
    T.falsy(Discord.valid_client_id("123"))
    T.falsy(Discord.valid_client_id("12345678901234567x"))
    T.falsy(Discord.valid_client_id(nil))
end)

T.test("activity: fields trimmed to Discord limits, empty presence means none", function()
    local b = Discord.activity({ details = "Game", buttons = { { label = string.rep("L", 40), url = "https://x.test" }, { label = "bad", url = "http://x.test" }, { label = "c", url = "https://c.test" }, { label = "d", url = "https://d.test" } } })
    T.eq(#b.buttons, 2, "max two, https only"); T.eq(#b.buttons[1].label, 32); T.eq(b.buttons[2].label, "c")
    local a = Discord.activity({ details = "  Counter-Strike 2 ", state = string.rep("x", 200), start = 100.7 })
    T.eq(a.details, "Counter-Strike 2"); T.eq(#a.state, 128); T.eq(a.timestamps.start, 100)
    T.eq(Discord.activity(nil), nil)
    T.eq(Discord.activity({ details = "a" }), nil, "Discord rejects 1-character strings")
end)

T.test("connect: handshake with the Application ID, READY, then SET_ACTIVITY with our pid", function()
    local srv = fake_discord()
    local c = client(srv)
    T.truthy(c:connect(APP_ID))
    T.eq(srv.written[1].op, Discord.OP.HANDSHAKE)
    T.eq(srv.written[1].data.client_id, APP_ID); T.eq(srv.written[1].data.v, 1)
    T.truthy(c:status().connected)
    T.truthy(c:set_activity({ details = "Rust" }))
    local cmd = srv.written[2].data
    T.eq(cmd.cmd, "SET_ACTIVITY"); T.eq(cmd.args.pid, 4242); T.eq(cmd.args.activity.details, "Rust")
    T.truthy(c:set_activity({ details = "Rust" }))
    T.eq(#srv.written, 2, "unchanged activity is not re-sent")
    c:set_activity(nil)
    T.eq(srv.written[3].data.args.activity, nil, "clearing sends no activity")
end)

T.test("finds Discord on a later pipe number", function()
    local srv = fake_discord({ pipe = 3 })
    T.truthy(client(srv):connect(APP_ID))
end)

T.test("Discord not running: clear error and exponential backoff, force skips the wait", function()
    local now = { t = 1000 }
    local srv = fake_discord({ running = false })
    local c = client(srv, now)
    local ok, err = c:connect(APP_ID)
    T.falsy(ok); T.contains(err, "not running")
    T.eq(c.retry_at - now.t, 15)
    local ok2, why = c:connect(APP_ID)
    T.falsy(ok2); T.contains(why, "not running")
    T.eq(c.fails, 1, "no new attempt while waiting")
    c:connect(APP_ID, true)
    T.eq(c.retry_at - now.t, 30, "second failure doubles the wait")
end)

T.test("no READY (wrong Application ID) fails and closes the pipe", function()
    local srv = fake_discord({ ready = false })
    local c = client(srv)
    local ok, err = c:connect(APP_ID)
    T.falsy(ok); T.contains(err, "did not answer")
    T.eq(srv.closed, 1)
end)

T.test("a dropped pipe is detected on poll and reconnects later", function()
    local now = { t = 1000 }
    local srv = fake_discord()
    local c = client(srv, now)
    c:connect(APP_ID)
    srv.gone = true
    T.falsy(c:poll())
    T.falsy(c:status().connected)
    srv.gone = false
    now.t = now.t + 16
    T.truthy(c:connect(APP_ID))
end)

T.test("Discord CLOSE and ERROR frames are reported", function()
    local srv = fake_discord()
    local c = client(srv)
    c:connect(APP_ID)
    srv.inbox = Discord.encode_frame(Discord.OP.CLOSE, { code = 4000, message = "Invalid Client ID" })
    T.falsy(c:poll())
    T.contains(c:status().error, "Invalid Client ID")
end)

T.test("Spotify titles: 'Artist - Song' while playing, nothing when paused or on an ad", function()
    local s = NowPlaying.parse_spotify("Daft Punk - One More Time")
    T.eq(s.artist, "Daft Punk"); T.eq(s.title, "One More Time")
    T.eq(NowPlaying.parse_spotify("Artist - Song - Remastered 2011").title, "Song - Remastered 2011")
    T.eq(NowPlaying.parse_spotify("Spotify Premium"), nil)
    T.eq(NowPlaying.parse_spotify("Spotify Free"), nil)
    T.eq(NowPlaying.parse_spotify("Spotify"), nil)
    T.eq(NowPlaying.parse_spotify("Advertisement"), nil)
    T.eq(NowPlaying.parse_spotify(""), nil)
end)

T.test("SoundCloud titles: only a playing track (▶) counts", function()
    local s = NowPlaying.parse_soundcloud("\226\150\182 Night Drive by Synth Artist | Listen online for free on SoundCloud - Google Chrome")
    T.eq(s.title, "Night Drive"); T.eq(s.artist, "Synth Artist")
    local s2 = NowPlaying.parse_soundcloud("\226\150\182 Stream Song Name by Someone | Listen online for free on SoundCloud")
    T.eq(s2.title, "Song Name")
    T.eq(NowPlaying.parse_soundcloud("Night Drive by Synth Artist | Listen online for free on SoundCloud"), nil, "paused")
    T.eq(NowPlaying.parse_soundcloud("YouTube - Google Chrome"), nil)
    T.eq(NowPlaying.parse_soundcloud("\226\150\182 Discover | SoundCloud"), nil, "not a track page")
end)

T.test("now playing reads only enabled sources and only the right programs", function()
    local asked
    local function titles(exes)
        asked = exes
        return {
            { exe = "spotify.exe", title = "Spotify Premium" },
            { exe = "spotify.exe", title = "Artist - Track" },
            { exe = "chrome.exe", title = "\226\150\182 Tune by Maker | Listen online for free on SoundCloud" },
        }
    end
    local r = NowPlaying.read({ spotify = true, soundcloud = false }, titles)
    T.eq(r.current.source, "spotify"); T.eq(r.current.title, "Track")
    T.truthy(asked["spotify.exe"]); T.eq(asked["chrome.exe"], nil, "browsers not read when SoundCloud is off")
    local r2 = NowPlaying.read({ spotify = false, soundcloud = true }, titles)
    T.eq(r2.current.source, "soundcloud"); T.eq(r2.current.artist, "Maker")
    local called = false
    NowPlaying.read({}, function() called = true return {} end)
    T.falsy(called, "no window is read when both are off")
end)

-- Controller ------------------------------------------------------------------------------------

local function config(values)
    return { get = function(_, k) return values[k] end }
end

local function live(values, opts)
    opts = opts or {}
    local srv = fake_discord(opts.discord)
    local pressed = {}
    local win32 = {
        available = opts.available ~= false,
        pid = function() return 99 end, sleep = function() end,
        pipe_open = function(name) return srv.open(tonumber(name:match("(%d+)$"))) end,
        window_titles = function() return opts.titles or {} end,
        media_key = function(a) pressed[#pressed + 1] = a return true end,
    }
    local sessions = { active_list = function() return opts.games or {} end }
    local now = { t = 5000 }
    local l = Live.new({ config = config(values), win32 = win32, sessions = sessions, clock = function() return now.t end })
    return l, srv, pressed, now
end

local ON = { ["integrations.discord.enabled"] = true, ["integrations.discord.client_id"] = APP_ID }
local function last_activity(srv) return srv.written[#srv.written].data.args.activity end

T.test("presence shows the newest running game with its start time", function()
    local l, srv = live(ON, { games = { { appid = "730", name = "Counter-Strike 2", started_at = 100 }, { appid = "252490", name = "Rust", started_at = 200 } } })
    local st = l:tick()
    T.truthy(st.discord.connected); T.truthy(st.discord.showing)
    local a = last_activity(srv)
    T.eq(a.details, "Rust"); T.eq(a.state, "via OEmt.club"); T.eq(a.timestamps.start, 200)
    T.eq(a.buttons[1].label, "Join OEmt.club"); T.eq(a.buttons[1].url, "https://discord.gg/OEmt")
    local vals = { ["integrations.discord.enabled"] = true, ["integrations.discord.client_id"] = APP_ID, ["integrations.discord.invite_button"] = false }
    local l2, srv2 = live(vals, { games = { { appid = "730", name = "CS2", started_at = 1 } } })
    l2:tick()
    T.eq(last_activity(srv2).buttons, nil, "button off")
end)

T.test("no game: no presence unless 'In Steam' is on; music only when allowed", function()
    local l, srv = live(ON)
    l:tick()
    T.eq(#srv.written, 2, "handshake, then a clear (removes any old status)")
    T.eq(last_activity(srv), nil)
    local vals = { ["integrations.discord.enabled"] = true, ["integrations.discord.client_id"] = APP_ID,
                   ["integrations.discord.idle_presence"] = true, ["integrations.discord.show_music"] = true,
                   ["integrations.spotify.enabled"] = true }
    local l2, srv2 = live(vals, { titles = { { exe = "spotify.exe", title = "Band - Song" } } })
    l2:tick()
    local a = last_activity(srv2)
    T.eq(a.details, "In Steam"); T.eq(a.state, "Listening to Song by Band")
    local l3, srv3 = live({ ["integrations.discord.enabled"] = true, ["integrations.discord.client_id"] = APP_ID, ["integrations.discord.idle_presence"] = true,
                            ["integrations.spotify.enabled"] = true }, { titles = { { exe = "spotify.exe", title = "Band - Song" } } })
    l3:tick()
    T.eq(last_activity(srv3).state, "OEmt.club", "song hidden unless show_music is on")
end)

T.test("turning Discord off clears the status and disconnects", function()
    local vals = { ["integrations.discord.enabled"] = true, ["integrations.discord.client_id"] = APP_ID }
    local l, srv = live(vals, { games = { { appid = "1", name = "Game", started_at = 1 } } })
    l:tick()
    vals["integrations.discord.enabled"] = false
    l:tick()
    T.eq(last_activity(srv), nil, "cleared")
    T.eq(srv.closed, 1)
    T.falsy(l:status().discord.connected)
end)

T.test("Discord off or no ID: nothing connects; status explains", function()
    local l, srv = live({})
    l:tick()
    T.eq(srv.opened, 0)
    local l2, srv2 = live({ ["integrations.discord.enabled"] = true })
    local st = l2:tick()
    T.eq(srv2.opened, 0); T.falsy(st.discord.configured); T.contains(st.discord.error, "Application ID")
end)

T.test("test status shows for 15 seconds, then the real presence returns", function()
    local l, srv, _, now = live(ON)
    T.truthy(l:test())
    T.eq(last_activity(srv).state, "Rich Presence is working")
    now.t = now.t + 16
    l:tick()
    T.eq(last_activity(srv), nil, "back to no presence (no game running)")
    local off = live({})
    local res, err = off:test()
    T.eq(res, nil); T.contains(err, "Turn on")
end)

T.test("media keys: only known actions, only when a music integration is on", function()
    local l, _, pressed = live({ ["integrations.spotify.enabled"] = true })
    T.truthy(l:media("play_pause")); T.truthy(l:media("next")); T.truthy(l:media("previous"))
    T.eq(table.concat(pressed, ","), "play_pause,next,previous")
    local ok, err = l:media("volume_up")
    T.eq(ok, nil); T.contains(err, "unknown")
    local l2 = live({})
    local ok2, err2 = l2:media("play_pause")
    T.eq(ok2, nil); T.contains(err2, "Turn on")
end)

T.test("without Windows support everything stays off", function()
    local l, srv = live(ON, { available = false })
    local st = l:tick()
    T.falsy(st.available); T.eq(srv.opened, 0)
end)

T.test("win32 bindings load on Windows and read only the programs asked for", function()
    local w = require("core.win32")
    if not w.available then return end -- non-Windows test host
    T.eq(type(w.pid()), "number")
    local titles = w.window_titles({ ["oemt-no-such-program.exe"] = true })
    T.eq(#titles, 0)
    T.eq(w.pipe_open("\\\\.\\pipe\\oemt-test-no-such-pipe"), nil)
    T.falsy(w.media_key("not-a-key"))
end)
