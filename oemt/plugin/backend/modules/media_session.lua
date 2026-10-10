-- Windows' system media session (what the volume pop-up shows) through oemt-media.exe:
-- title, artist, album, cover art, play state, position and duration of whatever is playing in the
-- Spotify app or a browser (SoundCloud, YouTube, …), plus play/pause, next, previous, seek, shuffle
-- and repeat. Used by the player bar and by Discord's "listening to".
local json = require("core.jsonlite")

local M = {}

M.CACHE_S = 1
M.COMMANDS = { play_pause = true, next = true, previous = true, shuffle = true, repeat_mode = true, seek = true, volume = true, mute = true }

--- App id -> friendly source name.
function M.source_of(app)
    local a = tostring(app or ""):lower()
    if a:find("spotify", 1, true) then return "spotify", "Spotify" end
    for _, b in ipairs({ { "opera", "Opera" }, { "chrome", "Chrome" }, { "msedge", "Edge" }, { "edge", "Edge" },
                         { "firefox", "Firefox" }, { "brave", "Brave" }, { "vivaldi", "Vivaldi" } }) do
        if a:find(b[1], 1, true) then return "browser", b[2] end
    end
    return "app", app ~= "" and tostring(app) or "Media"
end

--- deps: { helper = path to oemt-media.exe | nil, exec, exists, clock }
function M.new(deps)
    local self = setmetatable({}, { __index = M })
    self.d = deps or {}
    self.clock = self.d.clock or os.time
    self.cached, self.cached_at = nil, -1
    self.thumb_key, self.thumb = nil, nil
    return self
end

function M:available()
    local h = self.d.helper
    return h ~= nil and self.d.exec ~= nil and (self.d.exists == nil or self.d.exists(h))
end

function M:_run(args)
    if not self:available() then return nil, "media helper not installed" end
    local cmd = '"' .. tostring(self.d.helper):gsub("/", "\\") .. '" ' .. args
    local out = self.d.exec(cmd)
    if type(out) ~= "string" or out == "" then return nil, "no answer from media helper" end
    local doc = json.decode(out:match("^%s*(.-)%s*$"))
    if type(doc) ~= "table" then return nil, "bad answer from media helper" end
    if doc.error then return nil, tostring(doc.error) end
    return doc
end

local function shape(s)
    if type(s) ~= "table" then return nil end
    local source, label = M.source_of(s.app)
    local can = type(s.can) == "table" and s.can or {}
    return {
        source = source, app = label, title = tostring(s.title or ""), artist = tostring(s.artist or ""),
        album = tostring(s.album or ""), state = tostring(s.state or "closed"),
        position = tonumber(s.position) or 0, duration = tonumber(s.duration) or 0,
        shuffle = s.shuffle, ["repeat"] = s["repeat"], has_thumb = s.has_thumb == true,
        thumb_key = tostring(s.title or "") .. "|" .. tostring(s.artist or ""),
        can = { play_pause = can.play_pause == true, next = can.next == true, previous = can.previous == true,
                seek = can.seek == true, shuffle = can.shuffle == true, ["repeat"] = can["repeat"] == true },
    }
end

--- Current session (or nil when nothing is playing). Cached for a second so several callers share it.
function M:current(force)
    local now = self.clock()
    if not force and self.cached_at >= 0 and now - self.cached_at < M.CACHE_S then return self.cached end
    local doc, err = self:_run("status")
    self.cached_at = now
    if not doc then
        self.cached, self.error = nil, err
        return nil, err
    end
    self.error = nil
    local cur = shape(doc.current)
    self.volume = type(doc.volume) == "table" and { level = tonumber(doc.volume.level) or 0, muted = doc.volume.muted == true } or nil
    if cur and cur.title == "" and cur.state == "closed" then cur = nil end
    self.cached = cur
    return cur
end

--- Cover art of the current session as a data: URL. Only re-read when the song changes.
function M:cover(key)
    if key and key == self.thumb_key and self.thumb then return { key = key, data_url = self.thumb } end
    local doc, err = self:_run("thumb")
    if not doc then return nil, err end
    self.thumb_key, self.thumb = doc.key, doc.data_url
    return { key = doc.key, data_url = doc.data_url }
end

function M:command(action, value)
    if not M.COMMANDS[action] then return nil, "unknown player command" end
    local args = action == "repeat_mode" and "repeat" or action
    if action == "seek" then
        local s = tonumber(value)
        if not s or s < 0 or s > 24 * 3600 then return nil, "invalid position" end
        args = string.format("seek %.2f", s)
    end
    if action == "volume" then
        local v = tonumber(value)
        if not v or v < 0 or v > 100 then return nil, "volume must be 0-100" end
        args = string.format("volume %d", math.floor(v + 0.5))
    end
    local doc, err = self:_run(args)
    if not doc then return nil, err end
    self.cached_at = -1 -- next status call reads fresh state
    if type(doc.volume) == "table" then self.volume = { level = tonumber(doc.volume.level) or 0, muted = doc.volume.muted == true } end
    return doc.ok == true
end

return M
