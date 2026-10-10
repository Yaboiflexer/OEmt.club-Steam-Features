-- Live integrations: Discord Rich Presence and "now playing" (Spotify / SoundCloud), plus media keys.
-- Driven by tick(): the frontend calls it every few seconds, and a game starting or stopping calls it
-- at once. Every feature is opt-in (integrations.<id>.enabled) and nothing is sent anywhere except
-- to the Discord app running on this PC.
local Discord = require("modules.discord_rpc")
local NowPlaying = require("modules.now_playing")

local M = {}

M.TEST_SECONDS = 15
M.MEDIA_ACTIONS = { play_pause = true, next = true, previous = true }

--- deps: { config, win32, sessions, clock, log }
function M.new(deps)
    local self = setmetatable({}, { __index = M })
    self.d = deps
    self.clock = deps.clock or os.time
    local w = deps.win32 or {}
    self.win32 = w
    self.discord = Discord.new({
        open = function(i) return w.pipe_open and w.pipe_open("\\\\.\\pipe\\discord-ipc-" .. i) or nil end,
        sleep = w.sleep or function() end,
        pid = w.pid and w.pid() or 0,
        clock = self.clock, log = deps.log,
    })
    self.now_playing = nil
    self.test_until = 0
    return self
end

function M:on(id) return self.d.config:get("integrations." .. id .. ".enabled") == true end
function M:opt(key) return self.d.config:get("integrations.discord." .. key) end

--- The game being played right now (newest running session), if any.
function M:current_game()
    local list = self.d.sessions and self.d.sessions:active_list() or {}
    local best
    for _, s in ipairs(list) do if not best or s.started_at > best.started_at then best = s end end
    return best
end

--- What Discord should show, as { details, state, start } or nil for nothing.
function M:presence(np)
    local music = self:opt("show_music") == true and np and np.title
        and ("Listening to " .. np.title .. (np.artist and (" by " .. np.artist) or "")) or nil
    local game = self:current_game()
    if game then
        return { details = game.name or ("App " .. tostring(game.appid)), state = music or "via OEmt.club", start = game.started_at }
    end
    if self:opt("idle_presence") == true then
        return { details = "In Steam", state = music or "OEmt.club" }
    end
    return nil
end

function M:tick()
    local enabled = { spotify = self:on("spotify"), soundcloud = self:on("soundcloud") }
    local list_titles = self.win32.window_titles or function() return {} end
    local okr, np = pcall(NowPlaying.read, enabled, list_titles)
    self.now_playing = okr and np.current or nil

    local discord_on = self:on("discord")
    local client_id = tostring(self:opt("client_id") or "")
    if discord_on and self.win32.available then
        self.discord:connect(client_id)
        if self.discord.conn then self.discord:poll() end
        if self.discord.ready then
            local act
            if self.clock() < self.test_until then
                act = Discord.activity({ details = "OEmt.club", state = "Rich Presence is working", start = self.test_started })
            else
                act = Discord.activity(self:presence(self.now_playing))
            end
            self.discord:set_activity(act)
        end
    elseif self.discord.conn then
        self.discord:set_activity(nil)
        self.discord:disconnect()
    end
    return self:status()
end

function M:status()
    local ds = self.discord:status()
    return {
        available = self.win32.available == true,
        discord = {
            enabled = self:on("discord"),
            configured = Discord.valid_client_id(tostring(self:opt("client_id") or "")),
            connected = ds.connected,
            error = self:on("discord") and ds.error or nil,
            retry_at = ds.retry_at,
            showing = self.discord.sent_key ~= nil and self.discord.sent_key ~= "none",
        },
        now_playing = self.now_playing,
        music_enabled = self:on("spotify") or self:on("soundcloud"),
    }
end

--- Show a test status for TEST_SECONDS (connects at once, ignoring the retry wait).
function M:test()
    if not self:on("discord") then return nil, "Turn on the Discord integration first" end
    if not self.win32.available then return nil, "Discord Rich Presence needs Windows" end
    local ok, err = self.discord:connect(tostring(self:opt("client_id") or ""), true)
    if not ok then return nil, err end
    self.test_started = self.clock()
    self.test_until = self.test_started + M.TEST_SECONDS
    return self:tick()
end

--- Play/pause, next or previous through Windows media keys.
function M:media(action)
    if not M.MEDIA_ACTIONS[action] then return nil, "unknown media action" end
    if not (self:on("spotify") or self:on("soundcloud")) then return nil, "Turn on Spotify or SoundCloud first" end
    if not (self.win32.media_key and self.win32.media_key(action)) then return nil, "Media keys are unavailable" end
    return true
end

function M:shutdown()
    if self.discord.conn then
        pcall(self.discord.set_activity, self.discord, nil)
        self.discord:disconnect()
    end
end

return M
