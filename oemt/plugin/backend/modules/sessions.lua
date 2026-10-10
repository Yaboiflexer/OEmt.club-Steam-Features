-- Game session tracking. Start/stop events come from Steam's own app-lifetime notifications
-- (SteamClient.GameSessions.RegisterForAppLifetimeNotifications) forwarded by the OEmt frontend.
-- History is stored locally as JSON, bounded by the "sessions.max_history" setting.
local util = require("core.util")
local json = require("core.jsonlite")

local M = {}
M.FILE_FORMAT = "oemt-sessions"

--- store: { load() -> text|nil, err; save(text) -> ok, err }  clock: fn() -> unix seconds
function M.new(opts)
    local self = {
        store = opts.store, clock = opts.clock or os.time, log = opts.log, max_history = opts.max_history or 500,
        lookup_name = opts.lookup_name or function() return nil end,
        active = {},      -- key "appid:instance" -> session
        history = {},     -- newest last
        next_id = 1, load_error = nil, save_error = nil, interrupted_on_load = 0,
    }
    return setmetatable(self, { __index = M })
end

local function key(appid, instance) return tostring(appid) .. ":" .. tostring(instance or 0) end

function M:load()
    if not self.store then return end
    local text, err = self.store.load()
    if not text then
        self.load_error = err and tostring(err) or nil -- missing file on first run is normal
        return
    end
    local doc, derr = json.decode(text)
    if type(doc) ~= "table" or doc.format ~= M.FILE_FORMAT or type(doc.history) ~= "table" then
        self.load_error = "session history unreadable (" .. tostring(derr or "bad format") .. "); starting fresh"
        if self.log then self.log:warn({ module = "sessions", event = "load", outcome = "reset", msg = self.load_error }) end
        -- keep the bad file for inspection rather than overwriting silently
        if self.store.backup then pcall(self.store.backup) end
        return
    end
    local hist = {}
    for _, s in ipairs(doc.history) do
        if type(s) == "table" and s.appid and tonumber(s.started_at) then
            if not s.ended_at and s.status ~= "interrupted" then
                -- the previous Steam run ended before we saw the game stop
                s.status = "interrupted"
                self.interrupted_on_load = self.interrupted_on_load + 1
            end
            hist[#hist + 1] = s
        end
    end
    self.history = hist
    self.next_id = (tonumber(doc.next_id) or (#hist + 1))
    self:_trim()
end

function M:_trim()
    local over = #self.history - self.max_history
    if over > 0 then
        local trimmed = {}
        for i = over + 1, #self.history do trimmed[#trimmed + 1] = self.history[i] end
        self.history = trimmed
    end
end

function M:save()
    if not self.store then return true end
    local text = json.encode({ format = M.FILE_FORMAT, version = 1, next_id = self.next_id, history = util.array(self.history) })
    local ok, err = self.store.save(text)
    if not ok then
        self.save_error = tostring(err)
        if self.log then self.log:error({ module = "sessions", event = "save", outcome = "failed", error = err }) end
    else
        self.save_error = nil
    end
    return ok, err
end

function M:set_max_history(n)
    self.max_history = n
    self:_trim()
end

--- Handle a lifetime notification. Returns the affected session (or nil if ignored).
function M:on_lifetime(appid, instance, running)
    appid = tostring(appid or "")
    if not appid:match("^%d+$") or appid == "0" then
        -- Steam reports 0 for non-Steam shortcuts; we cannot attribute those reliably.
        return nil, "unattributable app id"
    end
    local k = key(appid, instance)
    local now = self.clock()
    if running then
        if self.active[k] then return self.active[k], "already active" end
        local s = { id = self.next_id, appid = appid, instance = tonumber(instance) or 0,
                    name = self.lookup_name(appid), started_at = now, status = "running" }
        self.next_id = self.next_id + 1
        self.active[k] = s
        self.history[#self.history + 1] = s
        self:_trim()
        if self.log then self.log:info({ module = "sessions", event = "start", outcome = "ok", data = { appid = appid } }) end
        self:save()
        return s
    end
    local s = self.active[k]
    if not s then
        -- stop for a game started before OEmt loaded: record a stop-only marker
        if self.log then self.log:info({ module = "sessions", event = "stop", outcome = "untracked_start", data = { appid = appid } }) end
        return nil, "no matching start"
    end
    self.active[k] = nil
    s.ended_at = now
    s.duration_s = math.max(0, now - s.started_at)
    s.status = "ended"
    if self.log then self.log:info({ module = "sessions", event = "stop", outcome = "ok", data = { appid = appid, duration_s = s.duration_s } }) end
    self:save()
    return s
end

function M:active_list()
    local out = {}
    for _, s in pairs(self.active) do
        local c = util.deep_copy(s)
        c.elapsed_s = math.max(0, self.clock() - s.started_at)
        out[#out + 1] = c
    end
    table.sort(out, function(a, b) return a.started_at < b.started_at end)
    return util.array(out)
end

function M:history_list(limit, appid)
    local out = {}
    for i = #self.history, 1, -1 do
        local s = self.history[i]
        if not appid or s.appid == tostring(appid) then
            out[#out + 1] = s
            if limit and #out >= limit then break end
        end
    end
    return util.array(out)
end

function M:clear_history()
    local kept = {}
    for _, s in pairs(self.active) do kept[#kept + 1] = s end
    self.history = kept
    return self:save()
end

return M
