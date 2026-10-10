-- The user's OWN public IP over time: an auto log of changes (checked at startup and on a timer the
-- frontend drives) plus the IP seen at the start of each game session. Opt-in (network.ip_logging).
-- Looking up a public IP needs an outside service; this asks api.ipify.org, which returns only the IP.
-- The IP itself is never written to the structured log, and diagnostics exports redact IPs.
local util = require("core.util")
local json = require("core.jsonlite")

local M = {}

M.LOOKUP_URL = "https://api.ipify.org?format=json"
M.MAX_CHANGES = 500
M.MAX_SESSIONS = 1000

local function valid_ip(s)
    if type(s) ~= "string" or #s > 45 then return false end
    local a, b, c, d = s:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if a then
        for _, n in ipairs({ a, b, c, d }) do if tonumber(n) > 255 then return false end end
        return true
    end
    return s:match("^[%x:]+$") ~= nil and s:find(":", 1, true) ~= nil -- IPv6
end
M.valid_ip = valid_ip

--- opts: { http_get(url, opts) -> {status, body}|nil, err ; store { load, save, backup } ; clock ; log }
function M.new(opts)
    local self = setmetatable({}, { __index = M })
    self.http_get = opts.http_get
    self.store = opts.store
    self.clock = opts.clock or os.time
    self.log = opts.log
    self.changes = {}   -- { ip, first_seen, last_seen, checks, reason }
    self.sessions = {}  -- { at, appid, name, ip }
    self.last_error = nil
    return self
end

function M:load()
    if not self.store then return end
    local text = self.store.load()
    if not text then return end
    local doc = json.decode(text)
    if type(doc) ~= "table" or doc.format ~= "oemt-ip-log" then
        if self.store.backup then self.store.backup() end
        self.load_error = "IP log file was unreadable and has been set aside"
        return
    end
    for _, c in ipairs(doc.changes or {}) do if valid_ip(c.ip) then self.changes[#self.changes + 1] = c end end
    for _, s in ipairs(doc.sessions or {}) do if valid_ip(s.ip) then self.sessions[#self.sessions + 1] = s end end
end

function M:save()
    if not self.store then return true end
    while #self.changes > M.MAX_CHANGES do table.remove(self.changes, 1) end
    while #self.sessions > M.MAX_SESSIONS do table.remove(self.sessions, 1) end
    local ok, err = self.store.save(json.encode({
        format = "oemt-ip-log", version = 1,
        changes = util.array(self.changes), sessions = util.array(self.sessions),
    }))
    self.save_error = (not ok) and tostring(err) or nil
    return ok, err
end

function M:current()
    return self.changes[#self.changes]
end

--- Look up the public IP now. reason: "startup" | "auto" | "manual" | "session_start".
--- Returns { ip, changed } or nil, error.
function M:check(reason)
    if not self.http_get then return nil, "network lookups unavailable" end
    local res, err = self.http_get(M.LOOKUP_URL, { timeout = 8 })
    if not res then self.last_error = tostring(err) return nil, self.last_error end
    if res.status ~= 200 then self.last_error = "lookup returned HTTP " .. tostring(res.status) return nil, self.last_error end
    local doc = json.decode(res.body or "")
    local ip = type(doc) == "table" and doc.ip or nil
    if not valid_ip(ip) then self.last_error = "lookup returned no valid IP" return nil, self.last_error end
    self.last_error = nil

    local now = self.clock()
    local cur = self:current()
    local changed = not cur or cur.ip ~= ip
    if changed then
        self.changes[#self.changes + 1] = { ip = ip, first_seen = now, last_seen = now, checks = 1, reason = tostring(reason or "manual") }
    else
        cur.last_seen = now
        cur.checks = (cur.checks or 0) + 1
    end
    if self.log then
        self.log:info({ module = "ip_log", event = "check", outcome = changed and "changed" or "same", data = { reason = reason } })
    end
    self:save()
    return { ip = ip, changed = changed }
end

--- Record the IP for a game session start. Uses a fresh lookup; falls back to the last known IP.
function M:session_start(appid, name)
    local res = self:check("session_start")
    local ip = res and res.ip or (self:current() and self:current().ip)
    if not ip then return nil, self.last_error or "no IP known" end
    local entry = { at = self.clock(), appid = tostring(appid), name = name, ip = ip, fresh = res ~= nil }
    self.sessions[#self.sessions + 1] = entry
    self:save()
    return entry
end

function M:list(limit)
    limit = tonumber(limit) or 100
    local function newest_first(src)
        local out = {}
        for i = #src, math.max(1, #src - limit + 1), -1 do out[#out + 1] = src[i] end
        return util.array(out)
    end
    return { current = self:current(), changes = newest_first(self.changes), sessions = newest_first(self.sessions),
             last_error = self.last_error, save_error = self.save_error, load_error = self.load_error }
end

function M:clear()
    self.changes, self.sessions = {}, {}
    return self:save()
end

return M
