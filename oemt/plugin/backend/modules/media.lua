-- Media page: saved Spotify and SoundCloud links (playlists, albums, tracks, artists, …) that the
-- frontend plays with each service's official embedded player. Stored in <data>/media.json.
-- Only links to open.spotify.com and soundcloud.com are accepted; nothing is fetched by the backend.
local util = require("core.util")
local json = require("core.jsonlite")

local M = {}

M.MAX_ITEMS = 100
M.SPOTIFY_TYPES = { playlist = true, album = true, track = true, artist = true, episode = true, show = true }

local function clean_title(s) return (tostring(s or ""):gsub("[%c]", " "):gsub("^%s+", ""):gsub("%s+$", ""):sub(1, 80)) end

--- Parse a link. Returns { source, kind, ref, url } or nil, error.
---   Spotify: https://open.spotify.com/(intl-xx/)<type>/<id>[?…]  (also spotify:<type>:<id>)
---   SoundCloud: https://soundcloud.com/<user>[/<track> | /sets/<set>]
function M.parse(url)
    url = tostring(url or ""):gsub("^%s+", ""):gsub("%s+$", "")
    local t, id = url:match("^spotify:(%a+):([%w]+)$")
    if not t then
        local path = url:match("^https?://open%.spotify%.com/(.*)$")
        if path then
            path = path:gsub("^intl%-[%a%-]+/", ""):gsub("[?#].*$", "")
            t, id = path:match("^(%a+)/([%w]+)/?$")
        end
    end
    if t then
        if not M.SPOTIFY_TYPES[t] or not id or #id < 10 or #id > 40 then return nil, "Unsupported Spotify link" end
        return { source = "spotify", kind = t, ref = t .. "/" .. id, url = "https://open.spotify.com/" .. t .. "/" .. id }
    end
    local sc = url:match("^https?://soundcloud%.com/([%w%-_/]+)") or url:match("^https?://m%.soundcloud%.com/([%w%-_/]+)")
    if sc then
        sc = sc:gsub("/+$", "")
        local parts = {}
        for p in sc:gmatch("[^/]+") do parts[#parts + 1] = p end
        if #parts == 0 or #parts > 3 then return nil, "Unsupported SoundCloud link" end
        local kind = (#parts == 1 and "artist") or (parts[2] == "sets" and #parts == 3 and "playlist") or (#parts == 2 and "track") or nil
        if not kind then return nil, "Unsupported SoundCloud link" end
        return { source = "soundcloud", kind = kind, ref = sc, url = "https://soundcloud.com/" .. sc }
    end
    return nil, "Paste a link from open.spotify.com or soundcloud.com"
end

--- deps: { store {load, save}, clock }
function M.new(deps)
    local self = setmetatable({}, { __index = M })
    self.d = deps or {}
    self.clock = self.d.clock or os.time
    self.items = {}
    return self
end

function M:load()
    local s = self.d.store
    local text = s and s.load()
    local doc = text and json.decode(text)
    if type(doc) ~= "table" or doc.format ~= "oemt-media" then return end
    for _, it in ipairs(type(doc.items) == "table" and doc.items or {}) do
        local p = type(it) == "table" and M.parse(it.url)
        if p and #self.items < M.MAX_ITEMS then
            p.id, p.title, p.added_at = tostring(it.id or ""), clean_title(it.title), tonumber(it.added_at) or 0
            if p.id ~= "" then self.items[#self.items + 1] = p end
        end
    end
end

function M:_save()
    local s = self.d.store
    if not s then return true end
    return s.save(json.encode({ format = "oemt-media", version = 1, items = util.array(self.items) }))
end

function M:list() return util.array(util.deep_copy(self.items)) end

--- Add a link (duplicates move to the top instead of being added twice).
function M:add(url, title)
    local p, err = M.parse(url)
    if not p then return nil, err end
    for i, it in ipairs(self.items) do
        if it.source == p.source and it.ref == p.ref then
            table.remove(self.items, i)
            if clean_title(title) ~= "" then it.title = clean_title(title) end
            table.insert(self.items, 1, it)
            self:_save()
            return it
        end
    end
    if #self.items >= M.MAX_ITEMS then return nil, "List is full (" .. M.MAX_ITEMS .. " items)" end
    p.id = string.format("m%x%04x", self.clock(), math.random(0, 0xffff))
    p.title = clean_title(title)
    p.added_at = self.clock()
    table.insert(self.items, 1, p)
    local ok, serr = self:_save()
    if not ok then table.remove(self.items, 1) return nil, "Could not save: " .. tostring(serr) end
    return p
end

function M:remove(id)
    for i, it in ipairs(self.items) do
        if it.id == id then
            table.remove(self.items, i)
            return self:_save()
        end
    end
    return false, "not found"
end

function M:rename(id, title)
    for _, it in ipairs(self.items) do
        if it.id == id then it.title = clean_title(title); return self:_save() end
    end
    return false, "not found"
end

return M
