local Media = require("modules.media")

local function mem()
    local st = {}
    st.load = function() return st.text end
    st.save = function(t) st.text = t return true end
    return st
end

T.test("parses Spotify links (web, intl, URI) and SoundCloud links", function()
    local p = Media.parse("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc")
    T.eq(p.source, "spotify"); T.eq(p.kind, "playlist"); T.eq(p.ref, "playlist/37i9dQZF1DXcBWIGoYBM5M")
    T.eq(Media.parse("https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy").ref, "album/4aawyAB9vmqN3uQ7FjRGTy")
    T.eq(Media.parse("spotify:track:11dFghVXANMlKmJXsNCbNl").kind, "track")
    local s = Media.parse("https://soundcloud.com/artist-name/sets/my-mix")
    T.eq(s.source, "soundcloud"); T.eq(s.kind, "playlist"); T.eq(s.url, "https://soundcloud.com/artist-name/sets/my-mix")
    T.eq(Media.parse("https://soundcloud.com/artist-name/song-1").kind, "track")
    T.eq(Media.parse("https://soundcloud.com/artist-name").kind, "artist")
end)

T.test("rejects other sites and malformed links", function()
    for _, bad in ipairs({ "https://evil.test/playlist/x", "https://open.spotify.com/user/someone", "https://open.spotify.com/playlist/short",
                           "javascript:alert(1)", "https://soundcloud.com/a/b/c/d", "" }) do
        local p, err = Media.parse(bad)
        T.eq(p, nil, bad); T.truthy(err, bad)
    end
end)

T.test("add, rename, remove; duplicates move to the top; saved and reloaded", function()
    local store = mem()
    local m = Media.new({ store = store, clock = function() return 1000 end })
    T.truthy(m:add("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "Chill"))
    T.truthy(m:add("https://soundcloud.com/artist-name/sets/my-mix", ""))
    T.eq(m:list()[1].source, "soundcloud")
    T.truthy(m:add("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=zzz"))
    T.eq(#m:list(), 2, "same playlist not added twice")
    T.eq(m:list()[1].title, "Chill", "moved to the top, title kept")
    local id = m:list()[1].id
    T.truthy(m:rename(id, "  Focus\n "))
    T.eq(m:list()[1].title, "Focus")
    local m2 = Media.new({ store = store }); m2:load()
    T.eq(#m2:list(), 2); T.eq(m2:list()[1].title, "Focus")
    T.truthy(m2:remove(id)); T.eq(#m2:list(), 1)
    T.falsy(m2:remove("nope"))
    local _, err = m2:add("https://example.com/x")
    T.contains(err, "open.spotify.com")
end)
