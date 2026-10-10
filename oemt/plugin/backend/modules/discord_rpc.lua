-- Discord Rich Presence over Discord's local IPC pipe (\\.\pipe\discord-ipc-0 … 9).
-- Protocol: frames of [opcode uint32 LE][length uint32 LE][JSON]. Opcodes: 0 handshake, 1 frame,
-- 2 close, 3 ping, 4 pong. After the handshake Discord answers with a READY dispatch; SET_ACTIVITY
-- then sets the status, and SET_ACTIVITY without an `activity` clears it.
-- Only an Application ID (public) is used. No token, no login, nothing read from the user's account.
local json = require("core.jsonlite")

local M = {}

M.OP = { HANDSHAKE = 0, FRAME = 1, CLOSE = 2, PING = 3, PONG = 4 }
M.MAX_PIPES = 10
M.READY_TIMEOUT_MS = 1500
M.BACKOFF_MIN_S = 15
M.BACKOFF_MAX_S = 300

local function u32(n)
    return string.char(n % 256, math.floor(n / 256) % 256, math.floor(n / 65536) % 256, math.floor(n / 16777216) % 256)
end
local function read_u32(s, i)
    local a, b, c, d = s:byte(i, i + 3)
    return a + b * 256 + c * 65536 + d * 16777216
end

function M.encode_frame(op, payload)
    local body = json.encode(payload)
    return u32(op) .. u32(#body) .. body
end

--- Split a byte buffer into complete frames. Returns frames ({ op, data }) and the unparsed rest.
function M.decode_frames(buf)
    local frames, i = {}, 1
    while #buf - i + 1 >= 8 do
        local op, len = read_u32(buf, i), read_u32(buf, i + 4)
        if #buf - i + 1 < 8 + len then break end
        local body = buf:sub(i + 8, i + 7 + len)
        frames[#frames + 1] = { op = op, data = json.decode(body) }
        i = i + 8 + len
    end
    return frames, buf:sub(i)
end

function M.valid_client_id(id)
    return type(id) == "string" and id:match("^%d+$") ~= nil and #id >= 17 and #id <= 20
end

--- Trim strings to Discord's limits (2..128 characters for details/state).
local function field(s)
    if type(s) ~= "string" then return nil end
    s = s:gsub("[%c]", " "):gsub("^%s+", ""):gsub("%s+$", "")
    if #s < 2 then return nil end
    return s:sub(1, 128)
end

--- Build a Discord activity table, or nil for "no presence".
--- presence: { details, state, start (unix s) }
function M.activity(presence)
    if not presence then return nil end
    local a = { details = field(presence.details), state = field(presence.state) }
    if not a.details and not a.state then return nil end
    if presence.start then a.timestamps = { start = math.floor(presence.start) } end
    -- Up to 2 link buttons (label 1-32 chars, https URL) that other people can click on the status.
    if type(presence.buttons) == "table" then
        local b = {}
        for _, x in ipairs(presence.buttons) do
            if #b < 2 and type(x.label) == "string" and type(x.url) == "string" and x.url:match("^https://") then
                b[#b + 1] = { label = x.label:sub(1, 32), url = x.url:sub(1, 512) }
            end
        end
        if #b > 0 then a.buttons = b end
    end
    return a
end

--- deps: { open = fn(index) -> conn|nil, sleep = fn(ms), pid = number, clock = fn() -> s, log }
function M.new(deps)
    local self = setmetatable({}, { __index = M })
    self.d = deps
    self.clock = deps.clock or os.time
    self.conn = nil
    self.buf = ""
    self.ready = false
    self.nonce = 0
    self.fails = 0
    self.retry_at = 0
    self.client_id = nil
    self.last_error = nil
    self.sent_key = nil
    return self
end

function M:disconnect(reason)
    if self.conn then
        pcall(self.conn.close)
        self.conn = nil
    end
    self.ready, self.buf, self.sent_key = false, "", nil
    if reason then self.last_error = reason end
end

function M:_fail(reason)
    self:disconnect(reason)
    self.fails = self.fails + 1
    self.retry_at = self.clock() + math.min(M.BACKOFF_MAX_S, M.BACKOFF_MIN_S * 2 ^ (self.fails - 1))
    return false, reason
end

--- Read whatever Discord sent; handles READY, CLOSE and PING. Returns false if the pipe broke.
function M:poll()
    if not self.conn then return false end
    local data, err = self.conn.read_available()
    if not data then return self:_fail(err or "Discord closed the connection") end
    if data == "" then return true end
    local frames
    frames, self.buf = M.decode_frames(self.buf .. data)
    for _, f in ipairs(frames) do
        if f.op == M.OP.CLOSE then
            local msg = type(f.data) == "table" and f.data.message or "closed"
            return self:_fail("Discord closed the connection: " .. tostring(msg))
        elseif f.op == M.OP.PING then
            self.conn.write(M.encode_frame(M.OP.PONG, f.data or {}))
        elseif type(f.data) == "table" then
            if f.data.evt == "READY" then self.ready = true; self.fails = 0; self.last_error = nil end
            if f.data.evt == "ERROR" then
                self.last_error = "Discord: " .. tostring(type(f.data.data) == "table" and f.data.data.message or "error")
            end
        end
    end
    return true
end

--- Connect and handshake. Skips while backing off unless `force`.
function M:connect(client_id, force)
    if self.conn and self.client_id == client_id then return true end
    self:disconnect()
    if not M.valid_client_id(client_id) then
        self.last_error = "Set a Discord Application ID (17-20 digits) in Settings"
        return false, self.last_error
    end
    if not force and self.clock() < self.retry_at then return false, self.last_error end
    self.client_id = client_id
    local conn
    for i = 0, M.MAX_PIPES - 1 do
        conn = self.d.open(i)
        if conn then break end
    end
    if not conn then return self:_fail("Discord is not running") end
    self.conn = conn
    if not conn.write(M.encode_frame(M.OP.HANDSHAKE, { v = 1, client_id = client_id })) then
        return self:_fail("Handshake failed")
    end
    local waited = 0
    while not self.ready and waited < M.READY_TIMEOUT_MS do
        local okp, why = self:poll()
        if not okp then return false, why end
        if not self.ready then
            self.d.sleep(25)
            waited = waited + 25
        end
    end
    if not self.ready then return self:_fail("Discord did not answer (is the Application ID right?)") end
    return true
end

--- Set (or clear, with nil) the activity. Unchanged activities are not re-sent.
function M:set_activity(activity)
    if not self.conn or not self.ready then return false, "not connected" end
    local key = activity and json.encode(activity) or "none"
    if key == self.sent_key then return true end
    self.nonce = self.nonce + 1
    local args = { pid = self.d.pid }
    if activity then args.activity = activity end
    if not self.conn.write(M.encode_frame(M.OP.FRAME, { cmd = "SET_ACTIVITY", args = args, nonce = tostring(self.nonce) })) then
        return self:_fail("Lost the connection to Discord")
    end
    self.sent_key = key
    return true
end

function M:status()
    return { connected = self.conn ~= nil and self.ready, error = self.last_error,
             retry_at = (self.retry_at > self.clock()) and self.retry_at or nil }
end

return M
