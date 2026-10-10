-- Reads the real Steam library from disk: libraryfolders.vdf + appmanifest_*.acf.
-- No polling: scans run at startup (if enabled) and when the user asks for a refresh.
local vdf  = require("core.vdf")
local util = require("core.util")

local M = {}

-- Apps that are Steam infrastructure rather than games.
M.HIDDEN_APPIDS = { ["228980"] = true } -- Steamworks Common Redistributables

local STATE_UPDATE_REQUIRED = 2
local STATE_FULLY_INSTALLED = 4

local function has_flag(flags, bit)
    flags = tonumber(flags) or 0
    return math.floor(flags / bit) % 2 == 1
end

--- io: { read_file(path) -> text|nil, err; list_dir(path) -> {names}|nil, err; exists(path) -> bool }
function M.read_library_folders(steam_path, io_)
    local path = util.join(steam_path, "steamapps", "libraryfolders.vdf")
    local text, err = io_.read_file(path)
    if not text then
        -- Fall back to the main Steam folder as the only library.
        return { { index = "0", path = util.norm_path(steam_path), label = "", source = "fallback" } },
               "libraryfolders.vdf unreadable: " .. tostring(err)
    end
    local doc, perr = vdf.parse(text)
    if not doc then
        return { { index = "0", path = util.norm_path(steam_path), label = "", source = "fallback" } },
               "libraryfolders.vdf malformed: " .. tostring(perr)
    end
    local root = vdf.get(doc, "libraryfolders") or {}
    local libs, seen = {}, {}
    for key, val in pairs(root) do
        if tostring(key):match("^%d+$") then
            local p, label
            if type(val) == "table" then p = vdf.get(val, "path"); label = vdf.get(val, "label")
            elseif type(val) == "string" then p = val end -- legacy format
            if p and p ~= "" then
                local np = util.norm_path(p)
                if not seen[np:lower()] then
                    seen[np:lower()] = true
                    libs[#libs + 1] = { index = tostring(key), path = np, label = label or "", source = "libraryfolders.vdf" }
                end
            end
        end
    end
    -- The Steam folder itself is always a library even if the index omits it.
    local main = util.norm_path(steam_path)
    if not seen[main:lower()] then
        table.insert(libs, 1, { index = "main", path = main, label = "", source = "steam_path" })
    end
    table.sort(libs, function(a, b) return (tonumber(a.index) or -1) < (tonumber(b.index) or -1) end)
    return libs
end

function M.parse_manifest(text)
    local doc, err = vdf.parse(text)
    if not doc then return nil, err end
    local st = vdf.get(doc, "AppState")
    if type(st) ~= "table" then return nil, "missing AppState" end
    local appid = vdf.get(st, "appid")
    if not appid or not tostring(appid):match("^%d+$") then return nil, "missing appid" end
    local flags = tonumber(vdf.get(st, "StateFlags")) or 0
    return {
        appid = tostring(appid),
        name = vdf.get(st, "name") or ("App " .. appid),
        installdir = vdf.get(st, "installdir"),
        state_flags = flags,
        installed = has_flag(flags, STATE_FULLY_INSTALLED),
        update_required = has_flag(flags, STATE_UPDATE_REQUIRED),
        size_bytes = tonumber(vdf.get(st, "SizeOnDisk")) or 0,
        last_updated = tonumber(vdf.get(st, "LastUpdated")) or 0,
        last_played = tonumber(vdf.get(st, "LastPlayed")) or 0,
    }
end

--- Full scan. Returns { libraries = [...], apps = [...], warnings = [...], scanned_at }
function M.scan(steam_path, io_)
    local result = { libraries = {}, apps = {}, warnings = {}, scanned_at = os.time() }
    if not steam_path or steam_path == "" then
        result.warnings[1] = "Steam path unknown"
        return result
    end
    local libs, lerr = M.read_library_folders(steam_path, io_)
    if lerr then result.warnings[#result.warnings + 1] = lerr end
    local seen_apps = {}
    for _, lib in ipairs(libs) do
        local steamapps = util.join(lib.path, "steamapps")
        local entry = { index = lib.index, path = lib.path, label = lib.label, app_count = 0, available = false }
        local names, derr = io_.list_dir(steamapps)
        if not names then
            entry.error = "unavailable: " .. tostring(derr)
            result.warnings[#result.warnings + 1] = "Library " .. lib.path .. " is unavailable (drive disconnected or folder moved?)"
        else
            entry.available = true
            table.sort(names)
            for _, name in ipairs(names) do
                if name:match("^appmanifest_%d+%.acf$") then
                    local text, rerr = io_.read_file(util.join(steamapps, name))
                    local app, perr
                    if text then app, perr = M.parse_manifest(text) end
                    if not app then
                        result.warnings[#result.warnings + 1] = name .. ": " .. tostring(perr or rerr)
                    elseif not M.HIDDEN_APPIDS[app.appid] and not seen_apps[app.appid] then
                        seen_apps[app.appid] = true
                        app.library = lib.index
                        if app.installdir and io_.exists then
                            app.files_present = io_.exists(util.join(steamapps, "common", app.installdir)) and true or false
                        end
                        result.apps[#result.apps + 1] = app
                        entry.app_count = entry.app_count + 1
                    end
                end
            end
        end
        result.libraries[#result.libraries + 1] = entry
    end
    table.sort(result.apps, function(a, b) return a.name:lower() < b.name:lower() end)
    util.array(result.apps); util.array(result.libraries); util.array(result.warnings)
    return result
end

--- Build the registry module definition.
function M.module(io_)
    local state = { last = nil, scans = 0, last_ms = nil, last_error = nil }
    local mod = {
        id = "steam_library", name = "Steam Library", version = "1.0.0", deps = { "config" },
    }
    function mod.refresh(ctx)
        local slog = ctx.log:scope("steam_library")
        local ok, res, ms = slog:op("scan", function() return M.scan(ctx.steam_path, io_) end)
        state.scans = state.scans + 1
        state.last_ms = ms
        if ok then
            state.last = res
            state.last_error = nil
            slog:info("scan_result", { data = { apps = #res.apps, libraries = #res.libraries, warnings = #res.warnings } })
            if ctx.events then ctx.events:emit("library.scanned", { apps = #res.apps }) end
        else
            state.last_error = tostring(res)
        end
        return ok, res
    end
    function mod.start(ctx)
        if ctx.config:get("library.scan_on_start") then mod.refresh(ctx) end
    end
    function mod.get(ctx, force)
        if force or not state.last then mod.refresh(ctx) end
        return state.last, state
    end
    function mod.find(appid)
        if not state.last then return nil end
        for _, a in ipairs(state.last.apps) do if a.appid == tostring(appid) then return a end end
        return nil
    end
    function mod.health()
        if state.last_error then return { status = "error", detail = state.last_error } end
        if not state.last then return { status = "ok", detail = "Not scanned yet" } end
        local unavailable = 0
        for _, l in ipairs(state.last.libraries) do if not l.available then unavailable = unavailable + 1 end end
        if unavailable > 0 then return { status = "degraded", detail = unavailable .. " library folder(s) unavailable" } end
        return { status = "ok", detail = #state.last.apps .. " installed apps" }
    end
    mod.state = state
    return mod
end

return M
