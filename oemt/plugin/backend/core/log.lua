-- Structured logger for OEmt.
--   * In-memory ring buffer (for the Diagnostics view)
--   * Optional JSON-Lines file sink with size-bounded rotation
--   * Optional mirror to Millennium's own logger
-- Every record is redacted before it is stored anywhere.
local util   = require("core.util")
local json   = require("core.jsonlite")
local redact = require("core.redact")

local M = {}
M.__index = M

M.LEVELS = { debug = 10, info = 20, warn = 30, error = 40 }

local function level_num(l) return M.LEVELS[l] or M.LEVELS.info end

--- opts: { level, ring_size, file_path, max_bytes, max_files, mirror (Millennium logger), clock }
function M.new(opts)
    opts = opts or {}
    local self = setmetatable({}, M)
    self.level = M.LEVELS[opts.level] and opts.level or "info"
    self.ring_size = opts.ring_size or 300
    self.ring = {}
    self.ring_head = 0
    self.count = 0
    self.file_path = opts.file_path
    self.max_bytes = opts.max_bytes or 512 * 1024
    self.max_files = opts.max_files or 3
    self.mirror = opts.mirror
    self.file_errors = 0
    self.last_file_error = nil
    self.dropped_file_writes = 0
    self.stats = { debug = 0, info = 0, warn = 0, error = 0 }
    return self
end

function M:set_level(level)
    if M.LEVELS[level] then self.level = level return true end
    return false
end

function M:configure_file(path, max_bytes, max_files)
    self.file_path = path
    if max_bytes then self.max_bytes = max_bytes end
    if max_files then self.max_files = max_files end
end

local function file_size(path)
    local f = io.open(path, "rb")
    if not f then return 0 end
    local size = f:seek("end") or 0
    f:close()
    return size
end

function M:_rotate()
    local base = self.file_path
    -- base.(n-1) is the oldest kept file; base itself counts as one of max_files.
    local keep = math.max(1, self.max_files)
    if keep == 1 then os.remove(base) return end
    os.remove(base .. "." .. (keep - 1))
    for i = keep - 2, 1, -1 do
        os.rename(base .. "." .. i, base .. "." .. (i + 1))
    end
    os.rename(base, base .. ".1")
end

function M:_write_file(line)
    if not self.file_path then return end
    -- after repeated failures stop trying to avoid hammering a broken disk
    if self.file_errors >= 5 then self.dropped_file_writes = self.dropped_file_writes + 1 return end
    if file_size(self.file_path) + #line + 1 > self.max_bytes then
        local ok, err = pcall(self._rotate, self)
        if not ok then self.last_file_error = tostring(err) end
    end
    local f, err = io.open(self.file_path, "ab")
    if not f then
        self.file_errors = self.file_errors + 1
        self.last_file_error = tostring(err)
        return
    end
    f:write(line, "\n")
    f:close()
end

--- Core logging call.
--- rec: { module, event, outcome?, cid?, duration_ms?, error?, data?, msg? }
function M:log(level, rec)
    if not M.LEVELS[level] then level = "info" end
    if level_num(level) < level_num(self.level) then return nil end
    rec = rec or {}
    local entry = {
        ts = util.iso_now(),
        level = level,
        module = tostring(rec.module or "core"),
        event = tostring(rec.event or "message"),
        cid = rec.cid,
        outcome = rec.outcome,
        duration_ms = rec.duration_ms and (math.floor(rec.duration_ms * 100 + 0.5) / 100) or nil,
        msg = rec.msg and redact.string(tostring(rec.msg)) or nil,
        error = rec.error and redact.string(tostring(rec.error)) or nil,
        data = rec.data and redact.value(rec.data) or nil,
    }
    self.count = self.count + 1
    self.stats[level] = (self.stats[level] or 0) + 1
    self.ring_head = (self.ring_head % self.ring_size) + 1
    self.ring[self.ring_head] = entry

    local ok, line = pcall(json.encode, entry)
    if ok then
        local wok, werr = pcall(self._write_file, self, line)
        if not wok then self.file_errors = self.file_errors + 1; self.last_file_error = tostring(werr) end
    end

    if self.mirror then
        local text = string.format("[%s] %s%s%s%s", entry.module, entry.event,
            entry.outcome and (" outcome=" .. entry.outcome) or "",
            entry.msg and (" " .. entry.msg) or "",
            entry.error and (" error=" .. entry.error) or "")
        local fn = (level == "error" and self.mirror.error) or (level == "warn" and self.mirror.warn) or self.mirror.info
        if fn then pcall(fn, self.mirror, text) end
    end
    return entry
end

function M:debug(rec) return self:log("debug", rec) end
function M:info(rec) return self:log("info", rec) end
function M:warn(rec) return self:log("warn", rec) end
function M:error(rec) return self:log("error", rec) end

--- Create a module-scoped logger: l = log:scope("steam_library"); l:info("scan", {...})
function M:scope(module)
    local parent = self
    local s = {}
    for _, lvl in ipairs({ "debug", "info", "warn", "error" }) do
        s[lvl] = function(_, event, extra)
            local rec = util.deep_copy(extra or {})
            rec.module = module
            rec.event = event
            return parent:log(lvl, rec)
        end
    end
    --- Time an operation, logging outcome + duration. Returns ok, result.
    s.op = function(_, event, fn, data)
        local cid = util.cid()
        local ok, res, ms = util.timed(fn)
        parent:log(ok and "info" or "error", {
            module = module, event = event, cid = cid, outcome = ok and "ok" or "failed",
            duration_ms = ms, error = (not ok) and res or nil, data = data,
        })
        return ok, res, ms
    end
    return s
end

--- Recent entries, newest first, filtered by minimum level and optional module.
function M:recent(limit, min_level, module)
    limit = limit or 100
    local min = level_num(min_level or "debug")
    local out = {}
    local n = math.min(self.count, self.ring_size)
    local idx = self.ring_head
    for _ = 1, n do
        local e = self.ring[idx]
        if e and level_num(e.level) >= min and (not module or e.module == module) then
            out[#out + 1] = e
            if #out >= limit then break end
        end
        idx = idx - 1
        if idx < 1 then idx = self.ring_size end
    end
    return util.array(out)
end

function M:status()
    return {
        level = self.level,
        total = self.count,
        by_level = util.deep_copy(self.stats),
        file_path = self.file_path and redact.string(self.file_path) or nil,
        file_bytes = self.file_path and file_size(self.file_path) or 0,
        max_bytes = self.max_bytes,
        max_files = self.max_files,
        file_errors = self.file_errors,
        last_file_error = self.last_file_error,
        dropped_file_writes = self.dropped_file_writes,
    }
end

--- Total bytes on disk across current + rotated files.
function M:disk_usage()
    if not self.file_path then return 0 end
    local total = file_size(self.file_path)
    for i = 1, math.max(0, self.max_files - 1) do total = total + file_size(self.file_path .. "." .. i) end
    return total
end

return M
