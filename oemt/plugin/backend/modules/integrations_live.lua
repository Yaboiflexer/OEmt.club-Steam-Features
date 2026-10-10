-- Discord Rich Presence, driven by tick(): the frontend calls it every few seconds, and a game starting
-- or stopping calls it at once. Opt-in (integrations.discord.enabled); nothing is sent anywhere except
-- to the Discord app running on this PC.
local Discord = require("modules.discord_rpc")

local M = {}

M.TEST_SECONDS = 15
M.INVITE = { label = "Join OEmt.club", url = "https://discord.gg/OEmt" }

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
    self.test_until = 0
    return self
end

function M:enabled() return self.d.config:get("integrations.discord.enabled") == true end
function M:opt(key) return self.d.config:get("integrations.discord." .. key) end

--- The game being played right now (newest running session), if any.
function M:current_game()
    local list = self.d.sessions and self.d.sessions:active_list() or {}
    local best
    for _, s in ipairs(list) do if not best or s.started_at > best.started_at then best = s end end
    return best
end

--- What Discord should show, as { details, state, start, buttons } or nil for nothing.
function M:presence()
    local buttons = self:opt("invite_button") ~= false and { M.INVITE } or nil
    local game = self:current_game()
    if game then
        return { details = game.name or ("App " .. tostring(game.appid)), state = "via OEmt.club", start = game.started_at, buttons = buttons }
    end
    if self:opt("idle_presence") == true then
        return { details = "In Steam", state = "OEmt.club", buttons = buttons }
    end
    return nil
end

function M:tick()
    local on = self:enabled()
    if on and self.win32.available then
        self.discord:connect(tostring(self:opt("client_id") or ""))
        if self.discord.conn then self.discord:poll() end
        if self.discord.ready then
            local act
            if self.clock() < self.test_until then
                act = Discord.activity({ details = "OEmt.club", state = "Rich Presence is working", start = self.test_started })
            else
                act = Discord.activity(self:presence())
            end
            self.discord:set_activity(act)
        end
    elseif self.discord.conn then
        self.discord:set_activity(nil)
        self.discord:disconnect()
    end
    local st = self:status()
    if on then self:_log(st.discord) end
    return st
end

--- Log connection changes once (connected, lost, error), not every tick.
function M:_log(st)
    local key = (st.connected and "connected") or (st.error or "off")
    if key == self.last_log then return end
    self.last_log = key
    if self.d.log then
        self.d.log:info({ module = "integrations", event = "discord", outcome = st.connected and "connected" or "disconnected",
                          msg = st.connected and "Rich Presence connected" or tostring(st.error or "off") })
    end
end

function M:status()
    local ds = self.discord:status()
    return {
        available = self.win32.available == true,
        discord = {
            enabled = self:enabled(),
            configured = Discord.valid_client_id(tostring(self:opt("client_id") or "")),
            connected = ds.connected,
            error = self:enabled() and ds.error or nil,
            retry_at = ds.retry_at,
            showing = self.discord.sent_key ~= nil and self.discord.sent_key ~= "none",
        },
    }
end

--- Show a test status for TEST_SECONDS (connects at once, ignoring the retry wait).
function M:test()
    if not self:enabled() then return nil, "Turn on Discord Rich Presence first" end
    if not self.win32.available then return nil, "Discord Rich Presence needs Windows" end
    local ok, err = self.discord:connect(tostring(self:opt("client_id") or ""), true)
    if not ok then return nil, err end
    self.test_started = self.clock()
    self.test_until = self.test_started + M.TEST_SECONDS
    return self:tick()
end

function M:shutdown()
    if self.discord.conn then
        pcall(self.discord.set_activity, self.discord, nil)
        self.discord:disconnect()
    end
end

return M
