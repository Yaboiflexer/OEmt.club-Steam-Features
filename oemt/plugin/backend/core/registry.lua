-- OEmt module registry: registration, dependency ordering, isolated lifecycle, health.
--
-- Module definition:
--   {
--     id = "steam_library",            -- unique, [a-z0-9_]
--     name = "Steam Library",
--     version = "1.0.0",
--     deps = { "config" },             -- ids that must start first
--     experimental = false,
--     enabled = function(ctx) return true end,  -- optional gate (e.g. a setting)
--     init  = function(ctx) end,       -- optional; allocate state, no heavy work
--     start = function(ctx) end,       -- optional; begin work
--     stop  = function(ctx) end,       -- optional; release resources
--     health = function(ctx) return { status = "ok"|"degraded"|"error", detail = "..." } end,
--   }
-- States: registered -> initialized -> started | failed | blocked | disabled ; started -> stopped
local util = require("core.util")

local M = {}
M.__index = M

function M.new(ctx)
    return setmetatable({ ctx = ctx or {}, modules = {}, order = nil, state = {} }, M)
end

function M:log(level, rec)
    local log = self.ctx.log
    if log then
        rec.module = rec.module or "registry"
        log:log(level, rec)
    end
end

function M:register(def)
    if type(def) ~= "table" then return false, "module definition must be a table" end
    if type(def.id) ~= "string" or not def.id:match("^[a-z][a-z0-9_]*$") then return false, "invalid module id" end
    if self.modules[def.id] then return false, "duplicate module id: " .. def.id end
    def.deps = def.deps or {}
    self.modules[def.id] = def
    self.state[def.id] = { status = "registered", error = nil, started_ms = nil }
    self.order = nil
    return true
end

--- Topological order; returns order or nil, err (cycle / missing dependency reported per-module).
function M:resolve()
    local order, visiting, visited, problems = {}, {}, {}, {}
    local function visit(id, chain)
        if visited[id] ~= nil then return visited[id] end
        if visiting[id] then
            problems[id] = "dependency cycle: " .. table.concat(chain, " -> ") .. " -> " .. id
            return false
        end
        local def = self.modules[id]
        if not def then return false end
        visiting[id] = true
        chain[#chain + 1] = id
        local ok = true
        for _, dep in ipairs(def.deps) do
            if not self.modules[dep] then
                problems[id] = "missing dependency: " .. dep
                ok = false
            elseif not visit(dep, chain) then
                problems[id] = problems[id] or ("dependency failed to resolve: " .. dep)
                ok = false
            end
        end
        chain[#chain] = nil
        visiting[id] = nil
        visited[id] = ok
        if ok then order[#order + 1] = id end
        return ok
    end
    for _, id in ipairs(util.keys_sorted(self.modules)) do visit(id, {}) end
    self.order = order
    return order, problems
end

local function call_phase(self, id, phase)
    local def = self.modules[id]
    local fn = def[phase]
    if type(fn) ~= "function" then return true end
    local ok, err, ms = util.timed(fn, self.ctx)
    self:log(ok and "debug" or "error", { event = phase, cid = util.cid(), outcome = ok and "ok" or "failed",
        duration_ms = ms, error = (not ok) and err or nil, data = { module_id = id } })
    return ok, err, ms
end

--- Initialise + start every module in dependency order. Failures are isolated.
function M:start_all()
    local order, problems = self:resolve()
    for id, why in pairs(problems) do
        self.state[id].status = "blocked"
        self.state[id].error = why
        self:log("error", { event = "resolve", outcome = "blocked", error = why, data = { module_id = id } })
    end
    for _, id in ipairs(order) do
        local def = self.modules[id]
        local st = self.state[id]
        local dep_failed
        for _, dep in ipairs(def.deps) do
            local ds = self.state[dep].status
            if ds ~= "started" then dep_failed = dep break end
        end
        if dep_failed then
            st.status = "blocked"
            st.error = "dependency not running: " .. dep_failed
        else
            local enabled = true
            if type(def.enabled) == "function" then
                local ok, res = pcall(def.enabled, self.ctx)
                enabled = ok and res ~= false
            end
            if not enabled then
                st.status = "disabled"
            else
                local ok, err = call_phase(self, id, "init")
                if not ok then st.status = "failed"; st.error = tostring(err)
                else
                    st.status = "initialized"
                    local ok2, err2, ms = call_phase(self, id, "start")
                    if ok2 then st.status = "started"; st.started_ms = ms; st.error = nil
                    else st.status = "failed"; st.error = tostring(err2) end
                end
            end
        end
    end
    return self:summary()
end

function M:stop_all()
    local order = self.order or self:resolve()
    for i = #order, 1, -1 do
        local id = order[i]
        if self.state[id].status == "started" then
            local ok, err = call_phase(self, id, "stop")
            self.state[id].status = ok and "stopped" or "failed"
            if not ok then self.state[id].error = tostring(err) end
        end
    end
end

function M:is_running(id)
    return self.state[id] ~= nil and self.state[id].status == "started"
end

function M:health()
    local out = {}
    for _, id in ipairs(util.keys_sorted(self.modules)) do
        local def, st = self.modules[id], self.state[id]
        local h = { id = id, name = def.name or id, version = def.version, experimental = def.experimental == true,
                    state = st.status, error = st.error, start_ms = st.started_ms }
        if st.status == "started" and type(def.health) == "function" then
            local ok, res = pcall(def.health, self.ctx)
            if ok and type(res) == "table" then
                h.status, h.detail = res.status or "ok", res.detail
            else
                h.status, h.detail = "error", "health check threw: " .. tostring(res)
            end
        elseif st.status == "started" then
            h.status = "ok"
        elseif st.status == "disabled" then
            h.status = "disabled"
        else
            h.status = "error"
        end
        out[#out + 1] = h
    end
    return util.array(out)
end

function M:summary()
    local counts = {}
    for _, st in pairs(self.state) do counts[st.status] = (counts[st.status] or 0) + 1 end
    return counts
end

return M
