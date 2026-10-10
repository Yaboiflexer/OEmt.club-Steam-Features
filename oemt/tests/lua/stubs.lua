-- Test doubles for Millennium-provided services.
local util = require("core.util")
local S = {}

--- In-memory virtual filesystem: files = { ["/path/file"] = "content" }, dirs inferred.
function S.vfs(files)
    local v = { files = files or {} }
    function v.read_file(p)
        p = util.norm_path(p)
        local c = v.files[p]
        if c == nil then return nil, p .. ": No such file or directory" end
        return c
    end
    function v.exists(p)
        p = util.norm_path(p)
        if v.files[p] then return true end
        local prefix = p .. "/"
        for k in pairs(v.files) do if k:sub(1, #prefix) == prefix then return true end end
        return false
    end
    function v.list_dir(p)
        p = util.norm_path(p)
        local prefix = p .. "/"
        local names, found = {}, false
        for k in pairs(v.files) do
            if k:sub(1, #prefix) == prefix then
                found = true
                local rest = k:sub(#prefix + 1)
                if not rest:find("/", 1, true) then names[#names + 1] = rest end
            end
        end
        if not found then return nil, "cannot open directory " .. p end
        return names
    end
    return v
end

function S.config_store(initial)
    local data = {}
    for k, v in pairs(initial or {}) do data[k] = v end
    local st = { data = data, sets = 0, fail_set = false }
    st.get_all = function() return data end
    st.set = function(k, v)
        if st.fail_set then return false, "disk full" end
        st.sets = st.sets + 1
        data[k] = v
        return true
    end
    st.delete = function(k) data[k] = nil return true end
    return st
end

function S.mirror()
    local m = { lines = {} }
    function m:info(t) self.lines[#self.lines + 1] = "I " .. t end
    function m:warn(t) self.lines[#self.lines + 1] = "W " .. t end
    function m:error(t) self.lines[#self.lines + 1] = "E " .. t end
    return m
end

function S.windows() return { os = "Windows", arch = "x64", is_windows = true } end

function S.manifest(appid, name, flags, extra)
    return string.format([["AppState"
{
	"appid"		"%s"
	"universe"		"1"
	"name"		"%s"
	"StateFlags"		"%d"
	"installdir"		"%s"
	"LastUpdated"		"1700000000"
	"LastPlayed"		"%d"
	"SizeOnDisk"		"%d"
}
]], appid, name, flags or 4, (extra and extra.installdir) or name, (extra and extra.last_played) or 0, (extra and extra.size) or 1000)
end

--- A realistic two-library Steam layout.
function S.steam_layout()
    local files = {
        ["C:/Steam/steam.exe"] = "MZ",
        ["C:/Steam/steamapps/libraryfolders.vdf"] = [["libraryfolders"
{
	"0"
	{
		"path"		"C:\\Steam"
		"label"		""
		"contentid"		"123"
		"apps"
		{
			"730"		"35000000000"
			"228980"		"1000"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"label"		"Games"
		"apps"
		{
			"252490"		"25000000000"
		}
	}
	"2"
	{
		"path"		"E:\\Unplugged"
		"label"		"USB"
	}
}
]],
        ["C:/Steam/steamapps/appmanifest_730.acf"] = S.manifest("730", "Counter-Strike 2", 4, { installdir = "Counter-Strike Global Offensive", last_played = 1760000000 }),
        ["C:/Steam/steamapps/appmanifest_228980.acf"] = S.manifest("228980", "Steamworks Common Redistributables", 4),
        ["C:/Steam/steamapps/common/Counter-Strike Global Offensive/game/bin"] = "x",
        ["D:/SteamLibrary/steamapps/appmanifest_252490.acf"] = S.manifest("252490", "Rust", 6, { last_played = 1759000000 }),
        ["D:/SteamLibrary/steamapps/appmanifest_999.acf"] = "this is { not valid",
        ["D:/SteamLibrary/steamapps/common/Rust/RustClient.exe"] = "MZ",
        ["D:/SteamLibrary/steamapps/appmanifest_440.acf"] = S.manifest("440", "Team Fortress 2", 4),
    }
    return files
end

return S
