-- OEmt.club — Millennium plugin entry point.
-- Wires the real Millennium/Steam services into the OEmt app and exposes the FFI surface.

-- Run interpreted, not JIT-compiled: the bundled LuaJIT build crashes intermittently with the JIT on
-- (reproduced with the test suite: crashes with the JIT on, 0 in 40 runs with -joff). OEmt's backend
-- does little work, so the interpreter is plenty fast. oemt/tests/lua/run.lua does the same.
if jit then jit.off(); jit.flush() end

local logger     = require("logger")
local millennium = require("millennium")
local fs         = require("fs")
local http       = require("http")
local utils      = require("utils")
local util       = require("core.util")
local App        = require("app")

local function resolve_data_dir()
    local cfg = os.getenv("MILLENNIUM__CONFIG_PATH")
    if not cfg or cfg == "" then
        local install = millennium.get_install_path()
        if install and install ~= "" then cfg = util.join(install, "config") end
    end
    if not cfg or cfg == "" then return nil end
    return util.join(cfg, "oemt")
end

local function production_services()
    local platform = util.platform()
    return {
        platform = platform,
        millennium_version = millennium.version(),
        cmp_version = function(a, b) return millennium.cmp_version(a, b) end,
        steam_path = util.norm_path(millennium.steam_path()),
        data_dir = resolve_data_dir(),
        mirror_logger = logger,
        getenv = os.getenv,
        http_get = function(url, opts) return http.get(url, opts) end,
        -- utils.exec runs `cmd /c <command>` hidden (CREATE_NO_WINDOW) and waits; callers detach with "start".
        exec = function(cmd) return utils.exec(cmd) end,
        -- Windows calls through LuaJIT's FFI: Discord's local pipe.
        win32 = require("core.win32"),
        -- Native helper for the sidebar music player: <Steam>/oemt/bin/oemt-media.exe
        media_helper = util.join(util.norm_path(millennium.steam_path()), "oemt", "bin", "oemt-media.exe"),
        read_file = util.read_file,
        exists = function(p) return fs.exists(p) end,
        mkdirs = function(p) return fs.create_directories(p) end,
        dir_writable = function(dir)
            local probe = util.join(dir, ".write-probe")
            local f = io.open(probe, "wb")
            if not f then return false end
            f:write("1"); f:close()
            os.remove(probe)
            return true
        end,
        list_dir = function(p)
            local entries, err = fs.list(p)
            if not entries then return nil, err end
            local names = {}
            for _, e in ipairs(entries) do if e.is_file then names[#names + 1] = e.name end end
            return names
        end,
        config_store = {
            get_all = function() return millennium.config.get_all() end,
            set = function(k, v) return millennium.config.set(k, v) end,
            delete = function(k) return millennium.config.delete(k) end,
        },
    }
end

local app_ok, app_or_err = pcall(App.new, production_services())
OEMT_APP = app_ok and app_or_err or nil
OEMT_BOOT_ERROR = (not app_ok) and tostring(app_or_err) or nil
if not app_ok then logger:error("[OEmt] boot failed: " .. OEMT_BOOT_ERROR) end

-- exposes the global ---@ffi functions. Not named "ffi": that is LuaJIT's built-in FFI library. Under
-- plain LuaJIT require("ffi") returns the built-in; inside Millennium a packed ffi.lua would replace
-- package.preload.ffi for the whole plugin process. A distinct name avoids both.
require("oemt_ffi")

local function on_load()
    if OEMT_APP then
        -- keep in-memory config in sync with changes made outside OEmt (e.g. Millennium settings UI)
        millennium.config.on_change(function(key, value) OEMT_APP.config:apply_external(key, value) end)
        logger:info("[OEmt] loaded " .. App.VERSION .. " on Millennium " .. millennium.version())
    end
    millennium.ready()
end

local function on_frontend_loaded()
    if OEMT_APP then OEMT_APP.log:info({ module = "startup", event = "frontend_loaded" }) end
end

local function on_unload()
    if OEMT_APP then pcall(App.shutdown, OEMT_APP) end
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded,
}
