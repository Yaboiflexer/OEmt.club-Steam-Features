local lib = require("modules.steam_library")
local S = require("stubs")

local function by_id(apps) local t = {} for _, a in ipairs(apps) do t[a.appid] = a end return t end

T.test("reads all library folders including the Steam folder", function()
    local v = S.vfs(S.steam_layout())
    local libs = lib.read_library_folders("C:/Steam", v)
    T.eq(#libs, 3)
    T.eq(libs[1].path, "C:/Steam"); T.eq(libs[2].path, "D:/SteamLibrary"); T.eq(libs[2].label, "Games")
end)

T.test("scan returns real manifest data, hides redistributables, flags problems", function()
    local v = S.vfs(S.steam_layout())
    local res = lib.scan("C:/Steam", v)
    local apps = by_id(res.apps)
    T.eq(#res.apps, 3)
    T.eq(apps["730"].name, "Counter-Strike 2"); T.truthy(apps["730"].installed); T.eq(apps["730"].files_present, true)
    T.eq(apps["730"].last_played, 1760000000)
    T.falsy(apps["228980"], "redistributables hidden")
    T.truthy(apps["252490"].update_required, "StateFlags 6 -> update required")
    T.eq(apps["440"].files_present, false, "manifest without game folder")
    T.eq(res.apps[1].name, "Counter-Strike 2", "sorted by name")
    -- E: library is unavailable, 999 manifest is malformed
    local unavailable = 0
    for _, l in ipairs(res.libraries) do if not l.available then unavailable = unavailable + 1 end end
    T.eq(unavailable, 1)
    local joined = table.concat(res.warnings, "\n")
    T.contains(joined, "appmanifest_999.acf"); T.contains(joined, "E:/Unplugged")
end)

T.test("legacy libraryfolders format is supported", function()
    local v = S.vfs({ ["C:/S/steamapps/libraryfolders.vdf"] = '"LibraryFolders" { "TimeNextStatsReport" "1" "ContentStatsID" "2" "1" "F:\\\\Lib" }' })
    local libs = lib.read_library_folders("C:/S", v)
    T.eq(#libs, 2); T.eq(libs[2].path, "F:/Lib")
end)

T.test("missing or corrupt libraryfolders.vdf falls back to the Steam folder", function()
    local v = S.vfs({ ["C:/S/steamapps/appmanifest_10.acf"] = S.manifest("10", "Counter-Strike", 4) })
    local res = lib.scan("C:/S", v)
    T.eq(#res.apps, 1); T.contains(res.warnings[1], "libraryfolders.vdf unreadable")
    local v2 = S.vfs({ ["C:/S/steamapps/libraryfolders.vdf"] = '"libraryfolders" {' })
    local libs, err = lib.read_library_folders("C:/S", v2)
    T.eq(#libs, 1); T.contains(err, "malformed")
end)

T.test("no steam path yields an empty result with a warning", function()
    local res = lib.scan(nil, S.vfs({}))
    T.eq(#res.apps, 0); T.eq(res.warnings[1], "Steam path unknown")
end)

T.test("duplicate apps across libraries are listed once", function()
    local files = S.steam_layout()
    files["D:/SteamLibrary/steamapps/appmanifest_730.acf"] = S.manifest("730", "Counter-Strike 2 (dup)", 4)
    local res = lib.scan("C:/Steam", S.vfs(files))
    local n = 0
    for _, a in ipairs(res.apps) do if a.appid == "730" then n = n + 1 end end
    T.eq(n, 1)
end)
