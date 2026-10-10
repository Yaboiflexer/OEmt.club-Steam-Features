-- Startup and dependency checks. Each check is independent and reports a real observation.
local util = require("core.util")

local M = {}

M.MIN_MILLENNIUM = "3.4.0" -- first release supporting .star (starlight) plugins with Lua backends

local function semver_cmp(a, b)
    local function parts(v)
        v = tostring(v or ""):gsub("^v", "")
        local x, y, z = v:match("^(%d+)%.(%d+)%.(%d+)")
        if not x then return nil end
        return { tonumber(x), tonumber(y), tonumber(z) }
    end
    local pa, pb = parts(a), parts(b)
    if not pa or not pb then return -2 end
    for i = 1, 3 do
        if pa[i] ~= pb[i] then return pa[i] < pb[i] and -1 or 1 end
    end
    return 0
end
M.semver_cmp = semver_cmp

--- env: { platform = util.platform(), millennium_version = "x.y.z", cmp_version = fn?,
---        steam_path = "...", data_dir = "...", file_exists = fn, dir_writable = fn }
--- Returns array of { id, label, status = "pass"|"warn"|"fail", detail }
function M.probe(env)
    local checks = {}
    local function add(id, label, status, detail) checks[#checks + 1] = { id = id, label = label, status = status, detail = detail } end
    local exists = env.file_exists or util.file_exists

    local p = env.platform or util.platform()
    if p.is_windows and p.arch == "x64" then
        add("platform", "Windows x64", "pass", "Running on " .. p.os .. " " .. p.arch)
    elseif p.is_windows then
        add("platform", "Windows x64", "warn", "Running on Windows " .. p.arch .. "; OEmt targets x64")
    else
        add("platform", "Windows x64", "warn", "Running on " .. tostring(p.os) .. "; OEmt is built and supported for Windows 10/11 x64")
    end

    local ver = env.millennium_version
    if not ver or ver == "" then
        add("millennium", "Millennium version", "fail", "Could not read Millennium version")
    else
        local cmp = env.cmp_version and env.cmp_version(ver, M.MIN_MILLENNIUM) or semver_cmp(ver, M.MIN_MILLENNIUM)
        if cmp == -2 then
            add("millennium", "Millennium version", "warn", "Unrecognised version string: " .. tostring(ver))
        elseif cmp < 0 then
            add("millennium", "Millennium version", "fail", string.format("%s is older than required %s", ver, M.MIN_MILLENNIUM))
        else
            add("millennium", "Millennium version", "pass", ver)
        end
    end

    local sp = env.steam_path
    if not sp or sp == "" then
        add("steam_path", "Steam installation", "fail", "Millennium did not report a Steam path")
    else
        local exe = p.is_windows and "steam.exe" or nil
        if exe and not exists(util.join(sp, exe)) then
            add("steam_path", "Steam installation", "warn", "Steam folder found but steam.exe was not")
        else
            add("steam_path", "Steam installation", "pass", "Steam folder found")
        end
        local lf = util.join(sp, "steamapps", "libraryfolders.vdf")
        if exists(lf) then
            add("steam_libraries", "Steam library index", "pass", "libraryfolders.vdf found")
        else
            add("steam_libraries", "Steam library index", "warn", "libraryfolders.vdf not found; library view will be empty")
        end
    end

    if env.data_dir then
        local writable = env.dir_writable and env.dir_writable(env.data_dir)
        if writable then
            add("data_dir", "OEmt data folder", "pass", "Writable")
        else
            add("data_dir", "OEmt data folder", "fail", "Not writable; logs and session history will not persist")
        end
    end

    return util.array(checks)
end

function M.overall(checks)
    local worst = "pass"
    for _, c in ipairs(checks) do
        if c.status == "fail" then return "fail" end
        if c.status == "warn" then worst = "warn" end
    end
    return worst
end

return M
