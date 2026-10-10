-- OEmt core utilities. Pure Lua (LuaJIT 2.1 / Lua 5.1 compatible), no Millennium dependencies.
local M = {}

local counter = 0

--- Monotonic-ish wall clock in milliseconds. Uses Millennium's `utils` module when available.
function M.now_ms()
    local ok, utils = pcall(require, "utils")
    if ok and type(utils) == "table" and type(utils.time_ms) == "function" then
        return utils.time_ms()
    end
    return math.floor(os.clock() * 1000) + os.time() * 1000
end

--- ISO-8601 UTC timestamp.
function M.iso_now(t)
    return os.date("!%Y-%m-%dT%H:%M:%SZ", t or os.time())
end

--- Short correlation id: 8 hex chars, unique within a process run.
function M.cid()
    counter = (counter + 1) % 0xFFFF
    local r = math.random(0, 0xFFFF)
    return string.format("%04x%04x", r, counter)
end

function M.deep_copy(v, seen)
    if type(v) ~= "table" then return v end
    seen = seen or {}
    if seen[v] then return seen[v] end
    local out = {}
    seen[v] = out
    for k, val in pairs(v) do out[M.deep_copy(k, seen)] = M.deep_copy(val, seen) end
    return out
end

function M.keys_sorted(t)
    local ks = {}
    for k in pairs(t) do ks[#ks + 1] = k end
    table.sort(ks, function(a, b) return tostring(a) < tostring(b) end)
    return ks
end

function M.trim(s)
    return (tostring(s):gsub("^%s+", ""):gsub("%s+$", ""))
end

--- Normalise a path to forward slashes without a trailing slash.
function M.norm_path(p)
    if type(p) ~= "string" then return nil end
    p = p:gsub("\\\\", "\\"):gsub("\\", "/")
    if #p > 1 then p = p:gsub("/+$", "") end
    return p
end

function M.join(...)
    local parts = { ... }
    local out = {}
    for i, part in ipairs(parts) do
        if part and part ~= "" then
            part = M.norm_path(part)
            if i > 1 then part = part:gsub("^/+", "") end
            out[#out + 1] = part
        end
    end
    return table.concat(out, "/")
end

function M.platform()
    local os_name, arch = "unknown", "unknown"
    if type(jit) == "table" then
        os_name = jit.os or os_name
        arch = jit.arch or arch
    end
    return { os = os_name, arch = arch, is_windows = os_name == "Windows" }
end

--- Run fn, measuring duration. Returns ok, result_or_err, duration_ms.
function M.timed(fn, ...)
    local t0 = os.clock()
    local ok, res = pcall(fn, ...)
    return ok, res, (os.clock() - t0) * 1000
end

function M.file_exists(path)
    if type(path) ~= "string" or path == "" then return false end
    local f = io.open(path, "rb")
    if f then f:close() return true end
    return false
end

function M.read_file(path)
    local f, err = io.open(path, "rb")
    if not f then return nil, err end
    local data = f:read("*a")
    f:close()
    return data
end

--- Write atomically: write to path.tmp then rename over the target.
function M.write_file_atomic(path, data)
    local tmp = path .. ".tmp"
    local f, err = io.open(tmp, "wb")
    if not f then return false, err end
    local ok, werr = f:write(data)
    f:close()
    if not ok then os.remove(tmp) return false, werr end
    os.remove(path) -- Windows rename does not overwrite
    local rok, rerr = os.rename(tmp, path)
    if not rok then return false, rerr end
    return true
end

--- Ensure a value is an array-like table (JSON array) even when empty.
function M.array(t)
    t = t or {}
    return setmetatable(t, { __jsontype = "array" })
end

math.randomseed(os.time())

return M
