-- "Now playing" from window titles, no login or API key:
--   Spotify desktop shows "Artist - Song" while playing and "Spotify …" when paused or idle.
--   SoundCloud in a browser tab shows "▶ Song by Artist | …SoundCloud" while playing; the title is
--   only visible to Windows when that tab is the selected one in its window.
-- Only windows of Spotify.exe and known browsers are read (see win32.window_titles).
local M = {}

M.SPOTIFY_EXES = { ["spotify.exe"] = true }
M.BROWSER_EXES = {
    ["chrome.exe"] = true, ["msedge.exe"] = true, ["firefox.exe"] = true, ["brave.exe"] = true,
    ["opera.exe"] = true, ["vivaldi.exe"] = true,
}

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

--- Spotify window title -> { artist, title } or nil when paused, idle or showing an ad.
function M.parse_spotify(title)
    if type(title) ~= "string" then return nil end
    title = trim(title)
    if title == "" or title:match("^Spotify") or title == "Advertisement" or title:match("^Spotify Free") then return nil end
    local artist, song = title:match("^(.-) %- (.+)$")
    if not artist or artist == "" then return nil end
    return { artist = artist, title = song }
end

local PLAYING_MARK = "\226\150\182" -- U+25B6 ▶

--- Browser tab title -> { artist, title } for a playing SoundCloud track, else nil.
function M.parse_soundcloud(title)
    if type(title) ~= "string" or not title:find("SoundCloud", 1, true) then return nil end
    local t = trim(title)
    if t:sub(1, #PLAYING_MARK) ~= PLAYING_MARK then return nil end -- not playing
    t = trim(t:sub(#PLAYING_MARK + 1))
    t = t:gsub("%s+|%s+.*$", "")                -- drop " | Listen online … SoundCloud"
    t = t:gsub("%s+%-%s+[^%-]*SoundCloud.*$", "") -- other browsers append " - Browser"
    t = t:gsub("^Stream%s+", "")
    local song, artist = t:match("^(.-) by (.+)$")
    if not song or song == "" then return nil end
    return { artist = trim(artist), title = trim(song) }
end

--- Read now playing. enabled = { spotify = bool, soundcloud = bool }; list_titles(exes) -> { {exe,title} }.
--- Returns { current = {source, artist, title}|nil, spotify = …|nil, soundcloud = …|nil }.
function M.read(enabled, list_titles)
    local exes = {}
    if enabled.spotify then for k in pairs(M.SPOTIFY_EXES) do exes[k] = true end end
    if enabled.soundcloud then for k in pairs(M.BROWSER_EXES) do exes[k] = true end end
    local out = {}
    if next(exes) == nil then return out end
    for _, w in ipairs(list_titles(exes) or {}) do
        if enabled.spotify and M.SPOTIFY_EXES[w.exe] and not out.spotify then
            out.spotify = M.parse_spotify(w.title)
        elseif enabled.soundcloud and M.BROWSER_EXES[w.exe] and not out.soundcloud then
            out.soundcloud = M.parse_soundcloud(w.title)
        end
    end
    local cur = out.spotify and { source = "spotify", artist = out.spotify.artist, title = out.spotify.title }
        or out.soundcloud and { source = "soundcloud", artist = out.soundcloud.artist, title = out.soundcloud.title }
    out.current = cur or nil
    return out
end

return M
