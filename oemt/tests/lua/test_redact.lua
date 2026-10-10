local redact = require("core.redact")

T.test("sensitive keys are redacted recursively", function()
    local out = redact.value({ user = "zy", password = "hunter2", nested = { access_token = "abc", ping = 12 }, PIN = "1234" })
    T.eq(out.user, "zy")
    T.eq(out.password, "[redacted]")
    T.eq(out.nested.access_token, "[redacted]")
    T.eq(out.nested.ping, 12, "ping must not be mistaken for pin")
    T.eq(out.PIN, "[redacted]")
end)

T.test("URL query strings are stripped", function()
    local s = redact.string("GET https://api.example.com/v1/me?access_token=SECRET&x=1 failed")
    T.not_contains(s, "SECRET")
    T.contains(s, "https://api.example.com/v1/me?[redacted]")
end)

T.test("key=value secrets and bearer tokens are stripped", function()
    local s = redact.string("session_key=ABC123 cookie: zzz Authorization: Bearer eyJhbGciOi.x.y")
    T.not_contains(s, "ABC123"); T.not_contains(s, "zzz"); T.not_contains(s, "eyJhbGciOi")
end)

T.test("SteamID64 values are masked", function()
    T.eq(redact.string("user 76561198000000001 joined"), "user [steamid] joined")
end)

T.test("non-sensitive text is unchanged", function()
    T.eq(redact.string("scan finished: 42 apps in 12ms"), "scan finished: 42 apps in 12ms")
end)
