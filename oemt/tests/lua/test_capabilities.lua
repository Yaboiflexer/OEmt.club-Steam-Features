local caps = require("core.capabilities")
local S = require("stubs")

local function find(checks, id) for _, c in ipairs(checks) do if c.id == id then return c end end end

T.test("healthy Windows environment passes", function()
    local v = S.vfs(S.steam_layout())
    local checks = caps.probe({ platform = S.windows(), millennium_version = "v3.5.0", steam_path = "C:/Steam",
                                data_dir = "C:/x", file_exists = v.exists, dir_writable = function() return true end })
    T.eq(caps.overall(checks), "pass")
end)

T.test("old Millennium, missing steam.exe and unwritable data dir are reported", function()
    local checks = caps.probe({ platform = S.windows(), millennium_version = "2.9.0", steam_path = "C:/Nope",
                                data_dir = "C:/x", file_exists = function() return false end, dir_writable = function() return false end })
    T.eq(find(checks, "millennium").status, "fail")
    T.eq(find(checks, "steam_path").status, "warn")
    T.eq(find(checks, "steam_libraries").status, "warn")
    T.eq(find(checks, "data_dir").status, "fail")
    T.eq(caps.overall(checks), "fail")
end)

T.test("non-Windows platform is a warning, not a crash", function()
    local checks = caps.probe({ platform = { os = "Linux", arch = "x64", is_windows = false }, millennium_version = "3.5.0", steam_path = "/s",
                                file_exists = function() return true end })
    T.eq(find(checks, "platform").status, "warn")
end)

T.test("semver comparison", function()
    T.eq(caps.semver_cmp("3.5.0", "3.4.0"), 1); T.eq(caps.semver_cmp("v3.4.0", "3.4.0"), 0)
    T.eq(caps.semver_cmp("3.3.9", "3.4.0"), -1); T.eq(caps.semver_cmp("garbage", "3.4.0"), -2)
end)
