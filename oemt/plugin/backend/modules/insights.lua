-- Insights.gg (Insights Capture) integration, all local:
--   * finds the installed app (Insights Capture V3 and the older Insights Capture);
--   * tells whether it is running (process list only);
--   * opens it, and can start it automatically when a game starts so recording is ready;
--   * lists recent recordings from its recordings folder and matches them to game sessions.
-- Insights keeps its own library in a private database; OEmt never reads that, nor its sign-in data.
local util = require("core.util")

local M = {}

M.EXE = "insights capture.exe"
M.INSTALLS = {
    { env = "LOCALAPPDATA", path = "Programs/Insights Capture V3/Insights Capture.exe", variant = "Insights Capture V3" },
    { env = "LOCALAPPDATA", path = "Programs/Insights Capture/Insights Capture.exe", variant = "Insights Capture" },
}
M.VIDEO_EXT = { mp4 = true, mkv = true, webm = true, mov = true }
M.MAX_LIST = 20
M.CLIP_GRACE_S = 300   -- recordings finished up to 5 minutes after a session still belong to it
M.SCAN_CACHE_S = 30
M.START_COOLDOWN_S = 120

--- deps: { getenv, exists, exec, scan_files(dir, depth), win32, config, clock, log }
function M.new(deps)
    local self = setmetatable({}, { __index = M })
    self.d = deps
    self.clock = deps.clock or os.time
    self.scan_at, self.scan = 0, nil
    self.last_start = 0
    return self
end

function M:enabled() return self.d.config:get("integrations.insights.enabled") == true end

--- Path and variant of the installed app, or nil.
function M:install()
    local getenv, exists = self.d.getenv or os.getenv, self.d.exists or util.file_exists
    for _, c in ipairs(M.INSTALLS) do
        local base = getenv(c.env)
        if base and base ~= "" then
            local p = util.join(base, c.path)
            if exists(p) then return { path = p, variant = c.variant } end
        end
    end
    return nil
end

function M:running()
    local w = self.d.win32
    if not (w and w.running) then return nil end
    local ok, found = pcall(w.running, { [M.EXE] = true })
    if not ok or type(found) ~= "table" then return nil end -- unknown
    return found[M.EXE] == true
end

--- Recordings folder: the setting, else Insights' default (Videos\Insights Capture).
function M:recordings_dir()
    local custom = self.d.config:get("integrations.insights.recordings_dir")
    if type(custom) == "string" and custom ~= "" then return custom end
    local home = (self.d.getenv or os.getenv)("USERPROFILE")
    return home and util.join(home, "Videos", "Insights Capture") or nil
end

--- Newest recordings first: { name, path, size, mtime }. Cached briefly; `force` rescans.
function M:recordings(force)
    local now = self.clock()
    if not force and self.scan and now - self.scan_at < M.SCAN_CACHE_S then return self.scan end
    local dir = self:recordings_dir()
    local list = {}
    if dir and self.d.scan_files then
        local ok, files = pcall(self.d.scan_files, dir, 3)
        for _, f in ipairs(ok and files or {}) do
            local ext = (f.name or ""):match("%.([%w]+)$")
            if ext and M.VIDEO_EXT[ext:lower()] then list[#list + 1] = f end
        end
    end
    table.sort(list, function(a, b) return (a.mtime or 0) > (b.mtime or 0) end)
    self.scan, self.scan_at = list, now
    return list
end

--- Recordings made during a session (finished between its start and end + grace).
function M:clips_for(session, recs)
    if not session or not session.started_at then return {} end
    local from = session.started_at
    local to = (session.ended_at or self.clock()) + M.CLIP_GRACE_S
    local out = {}
    for _, r in ipairs(recs or self:recordings()) do
        if r.mtime and r.mtime >= from and r.mtime <= to then out[#out + 1] = r end
    end
    return out
end

local function quote(p) return '"' .. tostring(p):gsub("/", "\\"):gsub('"', "") .. '"' end

--- Start Insights Capture (detached).
function M:open()
    local inst = self:install()
    if not inst then return nil, "Insights Capture is not installed" end
    if not self.d.exec then return nil, "starting programs is unavailable" end
    self.d.exec('start "" ' .. quote(inst.path))
    self.last_start = self.clock()
    return true
end

--- A game started: launch Insights if auto-start is on and it isn't running yet.
function M:on_game_started()
    if not self:enabled() or self.d.config:get("integrations.insights.auto_start") ~= true then return false end
    if self.clock() - self.last_start < M.START_COOLDOWN_S then return false end
    if self:running() ~= false then return false end -- running, or unknown
    local ok = self:open()
    if ok and self.d.log then self.d.log:info({ module = "insights", event = "auto_start", outcome = "ok" }) end
    return ok == true
end

local function inside(dir, path)
    local d = util.norm_path(dir):lower():gsub("/+$", "") .. "/"
    local p = util.norm_path(path):lower()
    return p:sub(1, #d) == d and not p:find("%.%.")
end

--- Open a recording (or, with no path, the recordings folder) in Windows. Only files inside the
--- recordings folder are allowed.
function M:reveal(path)
    local dir = self:recordings_dir()
    if not dir then return nil, "No recordings folder" end
    if not self.d.exec then return nil, "opening files is unavailable" end
    if path == nil or path == "" then
        self.d.exec('start "" ' .. quote(dir))
        return true
    end
    if not inside(dir, path) then return nil, "That file is not in the recordings folder" end
    if not (self.d.exists or util.file_exists)(path) then return nil, "The recording no longer exists" end
    self.d.exec('explorer.exe /select,' .. quote(path))
    return true
end

function M:status(force)
    local inst = self:install()
    local dir = self:recordings_dir()
    local recs = self:enabled() and self:recordings(force) or {}
    local top = {}
    for i = 1, math.min(M.MAX_LIST, #recs) do
        local r = recs[i]
        top[i] = { name = r.name, path = r.path, size = r.size, mtime = r.mtime }
    end
    return {
        installed = inst ~= nil, variant = inst and inst.variant or nil,
        running = self:running(), enabled = self:enabled(),
        auto_start = self.d.config:get("integrations.insights.auto_start") == true,
        recordings_dir = dir, recordings = util.array(top), recordings_total = #recs,
    }
end

return M
