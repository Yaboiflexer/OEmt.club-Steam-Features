-- Minimal synchronous event bus. Handlers are isolated: one failing handler never blocks the others.
local M = {}
M.__index = M

function M.new(log)
    return setmetatable({ handlers = {}, log = log, emitted = 0, handler_errors = 0 }, M)
end

--- Subscribe to an event name ("*" receives everything). Returns an unsubscribe function.
function M:on(name, fn)
    self.handlers[name] = self.handlers[name] or {}
    local list = self.handlers[name]
    list[#list + 1] = fn
    return function()
        for i, h in ipairs(list) do
            if h == fn then table.remove(list, i) return true end
        end
        return false
    end
end

function M:emit(name, payload)
    self.emitted = self.emitted + 1
    local delivered, failed = 0, 0
    local function run(list)
        if not list then return end
        -- copy so handlers may unsubscribe while we iterate
        local snapshot = {}
        for i, h in ipairs(list) do snapshot[i] = h end
        for _, h in ipairs(snapshot) do
            local ok, err = pcall(h, payload, name)
            if ok then delivered = delivered + 1 else
                failed = failed + 1
                self.handler_errors = self.handler_errors + 1
                if self.log then
                    self.log:error({ module = "events", event = "handler", outcome = "failed", error = err, data = { name = name } })
                end
            end
        end
    end
    run(self.handlers[name])
    if name ~= "*" then run(self.handlers["*"]) end
    return delivered, failed
end

return M
