local MS = require("modules.media_session")

local STATUS = '{"current":{"app":"Spotify.exe","title":"Song","artist":"Band","album":"LP","has_thumb":true,"state":"playing","shuffle":true,"repeat":"list","can":{"play_pause":true,"next":true,"previous":true,"seek":true,"shuffle":true,"repeat":true},"position":12.5,"duration":200},"sessions":[]}'

local function make(answers)
    local ran = {}
    local now = { t = 100 }
    local m = MS.new({
        helper = "C:/Steam/oemt/bin/oemt-media.exe", exists = function() return true end, clock = function() return now.t end,
        exec = function(cmd) ran[#ran + 1] = cmd; local a = answers[cmd:match('" (%S+)')] ; return type(a) == "function" and a() or a end,
    })
    return m, ran, now
end

T.test("status: current session shaped with source, controls and timeline; cached for a second", function()
    local m, ran, now = make({ status = STATUS })
    local c = m:current()
    T.eq(c.source, "spotify"); T.eq(c.app, "Spotify"); T.eq(c.title, "Song"); T.eq(c.state, "playing")
    T.eq(c.position, 12.5); T.eq(c.duration, 200); T.eq(c.shuffle, true); T.eq(c["repeat"], "list")
    T.truthy(c.can.seek); T.eq(c.thumb_key, "Song|Band")
    T.contains(ran[1], [["C:\Steam\oemt\bin\oemt-media.exe" status]])
    m:current(); T.eq(#ran, 1, "cached")
    now.t = now.t + 2; m:current(); T.eq(#ran, 2)
end)

T.test("browser sessions are labelled by browser; nothing playing gives nil", function()
    T.eq(select(2, MS.source_of("OperaSoftware.OperaGXWebBrowser.1714920620")), "Opera")
    T.eq(MS.source_of("Chrome"), "browser")
    local m = make({ status = '{"current":null,"sessions":[]}' })
    T.eq(m:current(), nil)
end)

T.test("helper errors and missing helper are reported, not thrown", function()
    local m = make({ status = '{"error":"no media session"}' })
    local c, err = m:current()
    T.eq(c, nil); T.contains(err, "no media session")
    local none = MS.new({ helper = nil, exec = function() end })
    T.falsy(none:available())
    local _, e2 = none:current()
    T.contains(e2, "not installed")
end)

T.test("cover art is fetched once per song", function()
    local n = 0
    local m = make({ thumb = function() n = n + 1 return '{"key":"Song|Band","data_url":"data:image/png;base64,AAA"}' end })
    T.eq(m:cover(nil).data_url, "data:image/png;base64,AAA")
    T.eq(m:cover("Song|Band").key, "Song|Band"); T.eq(n, 1, "same song: cached")
    m:cover("Other|Song"); T.eq(n, 2)
end)

T.test("commands: only known ones, seek validated, state re-read afterwards", function()
    local m, ran = make({ status = STATUS, next = '{"ok":true}', seek = '{"ok":true}', ["repeat"] = '{"ok":true}' })
    m:current()
    T.eq(m:command("next"), true)
    T.eq(m:command("seek", 42), true); T.contains(ran[#ran], "seek 42.00")
    T.eq(m:command("repeat_mode"), true); T.contains(ran[#ran], '" repeat')
    local ok, err = m:command("format_c")
    T.eq(ok, nil); T.contains(err, "unknown")
    local ok2, err2 = m:command("seek", -5)
    T.eq(ok2, nil); T.contains(err2, "invalid")
    local before = #ran
    m:current(); T.eq(#ran, before + 1, "fresh status after a command")
end)

T.test("volume: read with status, set 0-100 (validated), mute toggles", function()
    local STATUS_V = '{"current":null,"sessions":[],"volume":{"level":42,"muted":false}}'
    local m, ran = make({ status = STATUS_V, volume = '{"ok":true,"volume":{"level":60,"muted":false}}', mute = '{"ok":true,"volume":{"level":60,"muted":true}}' })
    m:current()
    T.eq(m.volume.level, 42)
    T.eq(m:command("volume", 60), true); T.contains(ran[#ran], "volume 60"); T.eq(m.volume.level, 60)
    T.eq(m:command("mute"), true); T.eq(m.volume.muted, true)
    local ok, err = m:command("volume", 150)
    T.eq(ok, nil); T.contains(err, "0-100")
end)
