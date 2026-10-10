-- Account Center. Lists the Steam accounts Steam itself remembers (config/loginusers.vdf: ids and
-- names only, never credentials) and switches between them through TcNo Account Switcher, which is
-- GPL-3 and therefore only ever started as a separate program via its documented CLI:
--   TcNo-Acc-Switcher.exe +s:<SteamID64>[:<PersonaState>]
-- Switching restarts Steam (and with it this process), so "switch then launch" is done by saving a
-- pending launch that the next OEmt start picks up once the expected account is signed in.
local util = require("core.util")
local vdf  = require("core.vdf")
local json = require("core.jsonlite")

local M = {}

M.TCNO_RELATIVE = "TcNo Account Switcher/TcNo-Acc-Switcher.exe"
M.PENDING_TTL_S = 300
-- Steam EPersonaState values accepted by TcNo's optional status argument.
M.PERSONA_STATES = { offline = 0, online = 1, busy = 2, away = 3, invisible = 7 }

local function valid_steamid(id) return type(id) == "string" and id:match("^7656119%d%d%d%d%d%d%d%d%d%d$") ~= nil end
M.valid_steamid = valid_steamid

--- Mask a login name for display: "myaccount" -> "my*****nt". Short names are fully masked.
function M.mask(name)
    if type(name) ~= "string" or name == "" then return "" end
    if #name <= 4 then return string.rep("*", #name) end
    return name:sub(1, 2) .. string.rep("*", #name - 4) .. name:sub(-2)
end

--- deps: { steam_path, read_file, exists, getenv, exec, clock, store_labels {load,save}, store_pending {load,save,clear}, log }
function M.new(deps)
    local self = setmetatable({}, { __index = M })
    self.d = deps
    self.clock = deps.clock or os.time
    self.labels = {}
    return self
end

function M:load()
    local s = self.d.store_labels
    local text = s and s.load()
    local doc = text and json.decode(text)
    if type(doc) == "table" and doc.format == "oemt-account-labels" and type(doc.labels) == "table" then
        for id, label in pairs(doc.labels) do
            if valid_steamid(id) and type(label) == "string" then self.labels[id] = label:sub(1, 40) end
        end
    end
end

function M:tcno_path()
    local base = self.d.getenv and self.d.getenv("ProgramFiles")
    if not base or base == "" then return nil end
    local p = util.join(base, M.TCNO_RELATIVE)
    if self.d.exists and self.d.exists(p) then return p end
    return nil
end

--- Accounts from Steam's loginusers.vdf, most recent first.
function M:list()
    local path = util.join(self.d.steam_path or "", "config", "loginusers.vdf")
    local text, err = self.d.read_file(path)
    if not text then return util.array(), "Steam's account list (loginusers.vdf) could not be read: " .. tostring(err) end
    local doc, perr = vdf.parse(text)
    if not doc then return util.array(), "loginusers.vdf is malformed: " .. tostring(perr) end
    local users = vdf.get(doc, "users") or {}
    local out = {}
    for id, u in pairs(users) do
        if valid_steamid(tostring(id)) and type(u) == "table" then
            local function flag(k) return vdf.get(u, k) == "1" end
            out[#out + 1] = {
                steamid = tostring(id),
                persona_name = vdf.get(u, "PersonaName") or "",
                account_masked = M.mask(vdf.get(u, "AccountName")),
                most_recent = flag("MostRecent"),
                remembered = flag("RememberPassword") or flag("AllowAutoLogin"),
                offline_mode = flag("WantsOfflineMode"),
                last_login = tonumber(vdf.get(u, "Timestamp")) or 0,
                label = self.labels[tostring(id)],
            }
        end
    end
    table.sort(out, function(a, b)
        if a.most_recent ~= b.most_recent then return a.most_recent end
        return a.last_login > b.last_login
    end)
    return util.array(out)
end

function M:current()
    for _, a in ipairs(self:list()) do if a.most_recent then return a end end
    return nil
end

function M:set_label(steamid, label)
    if not valid_steamid(steamid) then return false, "invalid account id" end
    label = tostring(label or ""):gsub("[%c]", ""):sub(1, 40)
    self.labels[steamid] = label ~= "" and label or nil
    local s = self.d.store_labels
    if not s then return true end
    return s.save(json.encode({ format = "oemt-account-labels", version = 1, labels = self.labels }))
end

--- Start TcNo to switch Steam to `steamid`. opts: { state = "online"|..., launch_appid = "730" }
function M:switch(steamid, opts)
    opts = opts or {}
    if not valid_steamid(steamid) then return nil, "invalid account id" end
    local known = false
    for _, a in ipairs(self:list()) do if a.steamid == steamid then known = true end end
    if not known then return nil, "That account is not in Steam's remembered account list" end
    local exe = self:tcno_path()
    if not exe then return nil, "TcNo Account Switcher was not found in Program Files" end
    if not self.d.exec then return nil, "starting programs is unavailable" end

    local arg = "+s:" .. steamid
    if opts.state and opts.state ~= "" then
        local n = M.PERSONA_STATES[opts.state]
        if not n then return nil, "unknown status " .. tostring(opts.state) end
        arg = arg .. ":" .. n
    end

    if opts.launch_appid and opts.launch_appid ~= "" then
        if not tostring(opts.launch_appid):match("^%d+$") then return nil, "invalid app id" end
        local s = self.d.store_pending
        if s then s.save(json.encode({ format = "oemt-pending-launch", appid = tostring(opts.launch_appid), steamid = steamid, created_at = self.clock() })) end
    end

    -- "start" detaches TcNo so this call returns at once; TcNo then restarts Steam.
    local cmd = string.format('start "" "%s" %s', exe:gsub("/", "\\"), arg)
    local _, code = self.d.exec(cmd)
    if code and code ~= 0 then return nil, "could not start TcNo (exit " .. tostring(code) .. ")" end
    if self.d.log then self.d.log:info({ module = "accounts", event = "switch", outcome = "requested", data = { state = opts.state, launch = opts.launch_appid ~= nil } }) end
    return { started = true }
end

--- After a restart: return the pending game if it is fresh and the expected account is signed in.
--- Always clears the pending entry so a launch can never fire twice.
function M:take_pending_launch()
    local s = self.d.store_pending
    if not s then return nil end
    local text = s.load()
    if not text then return nil end
    s.clear()
    local doc = json.decode(text)
    if type(doc) ~= "table" or doc.format ~= "oemt-pending-launch" then return nil end
    if (self.clock() - (tonumber(doc.created_at) or 0)) > M.PENDING_TTL_S then return { expired = true } end
    local cur = self:current()
    if not cur or cur.steamid ~= doc.steamid then return { wrong_account = true } end
    return { appid = doc.appid }
end

return M
