-- Centralised, validated OEmt configuration.
-- Persistence is delegated to a "store" with get_all/set/delete (Millennium's plugin config in production,
-- an in-memory table in tests). Invalid stored values are repaired to defaults and reported, never crash.
local schema = require("core.schema")
local util   = require("core.util")
local json   = require("core.jsonlite")

local M = {}
M.__index = M

M.EXPORT_FORMAT = "oemt-settings"

--- store: { get_all = fn() -> table, set = fn(k, v) -> ok, err, delete = fn(k) -> ok, err }
function M.new(store, log)
    local self = setmetatable({}, M)
    self.store = store
    self.log = log
    self.values = schema.defaults()
    self.issues = {}
    self.listeners = {}
    self.loaded = false
    return self
end

local function persist(self, key, value)
    if not self.store or not self.store.set then return true end
    local ok, res, err = pcall(self.store.set, key, value)
    if not ok then return false, tostring(res) end
    if res == false then return false, tostring(err or "store rejected value") end
    return true
end

--- Load from store, validating every known key. Returns list of issues.
function M:load()
    self.issues = {}
    local raw = {}
    if self.store and self.store.get_all then
        local ok, res = pcall(self.store.get_all)
        if ok and type(res) == "table" then
            raw = res
        else
            self.issues[#self.issues + 1] = { key = "*", problem = "could not read stored settings: " .. tostring(res), action = "using defaults" }
        end
    end
    local values = schema.defaults()
    for key, value in pairs(raw) do
        if schema.fields[key] then
            local ok, coerced = schema.check(key, value)
            if ok then
                values[key] = coerced
            else
                self.issues[#self.issues + 1] = { key = key, problem = coerced, action = "reset to default" }
                local pok, perr = persist(self, key, schema.fields[key].default)
                if not pok then
                    self.issues[#self.issues + 1] = { key = key, problem = "repair failed: " .. tostring(perr), action = "default used in memory" }
                end
            end
        else
            self.issues[#self.issues + 1] = { key = tostring(key), problem = "unknown setting", action = "ignored" }
        end
    end
    self.values = values
    self.loaded = true
    if self.log then
        self.log:info({ module = "config", event = "load", outcome = (#self.issues == 0) and "ok" or "repaired",
                        data = { issues = #self.issues } })
        for _, iss in ipairs(self.issues) do
            self.log:warn({ module = "config", event = "validate", outcome = iss.action, data = { key = iss.key }, msg = iss.problem })
        end
    end
    return self.issues
end

function M:get(key) return self.values[key] end

function M:all() return util.deep_copy(self.values) end

function M:on_change(fn) self.listeners[#self.listeners + 1] = fn end

local function notify(self, key, value)
    for _, fn in ipairs(self.listeners) do
        local ok, err = pcall(fn, key, value)
        if not ok and self.log then
            self.log:error({ module = "config", event = "listener", outcome = "failed", error = err, data = { key = key } })
        end
    end
end

--- Validate + persist a single setting. Returns ok, err_or_value.
function M:set(key, value)
    local ok, coerced = schema.check(key, value)
    if not ok then
        if self.log then self.log:warn({ module = "config", event = "set", outcome = "rejected", data = { key = key }, msg = coerced }) end
        return false, coerced
    end
    local pok, perr = persist(self, key, coerced)
    if not pok then
        if self.log then self.log:error({ module = "config", event = "set", outcome = "failed", data = { key = key }, error = perr }) end
        return false, "could not save: " .. tostring(perr)
    end
    local old = self.values[key]
    self.values[key] = coerced
    if self.log then self.log:info({ module = "config", event = "set", outcome = "ok", data = { key = key } }) end
    if old ~= coerced then notify(self, key, coerced) end
    return true, coerced
end

--- Apply a value that arrived from outside (e.g. millennium.config.on_change) without re-persisting.
function M:apply_external(key, value)
    if not schema.fields[key] then return false end
    local ok, coerced = schema.check(key, value)
    if not ok then return false end
    if self.values[key] ~= coerced then
        self.values[key] = coerced
        notify(self, key, coerced)
    end
    return true
end

--- Reset one key, or all keys when key is nil.
function M:reset(key)
    local keys = {}
    if key then
        if not schema.fields[key] then return false, "unknown setting" end
        keys[1] = key
    else
        for k in pairs(schema.fields) do keys[#keys + 1] = k end
    end
    local failed = {}
    for _, k in ipairs(keys) do
        local ok, err = self:set(k, schema.fields[k].default)
        if not ok then failed[#failed + 1] = { key = k, error = err } end
    end
    return #failed == 0, failed
end

function M:export()
    return json.encode({
        format = M.EXPORT_FORMAT,
        schema_version = schema.VERSION,
        exported_at = util.iso_now(),
        settings = self.values,
    })
end

--- Import settings JSON. Every value is validated; nothing is applied if the document is malformed.
--- Returns { ok, applied = n, rejected = [{key, reason}], error? }
function M:import(text)
    local doc, err = json.decode(text)
    if type(doc) ~= "table" then
        return { ok = false, applied = 0, rejected = util.array(), error = "not valid JSON: " .. tostring(err) }
    end
    if doc.format ~= M.EXPORT_FORMAT or type(doc.settings) ~= "table" then
        return { ok = false, applied = 0, rejected = util.array(), error = "not an OEmt settings export" }
    end
    if type(doc.schema_version) ~= "number" or doc.schema_version > schema.VERSION then
        return { ok = false, applied = 0, rejected = util.array(), error = "export is from a newer OEmt version" }
    end
    -- validate everything first, then apply
    local staged, rejected = {}, {}
    for key, value in pairs(doc.settings) do
        local ok, coerced = schema.check(key, value)
        if ok then staged[key] = coerced else rejected[#rejected + 1] = { key = tostring(key), reason = coerced } end
    end
    local applied = 0
    for _, key in ipairs(util.keys_sorted(staged)) do
        local ok, e = self:set(key, staged[key])
        if ok then applied = applied + 1 else rejected[#rejected + 1] = { key = key, reason = e } end
    end
    table.sort(rejected, function(a, b) return a.key < b.key end)
    if self.log then
        self.log:info({ module = "config", event = "import", outcome = (#rejected == 0) and "ok" or "partial",
                        data = { applied = applied, rejected = #rejected } })
    end
    return { ok = true, applied = applied, rejected = util.array(rejected) }
end

return M
