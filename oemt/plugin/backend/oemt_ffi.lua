-- FFI surface consumed by the OEmt frontend (frontend/api.ts).
-- Every function returns an envelope: { ok = true, data = ... } | { ok = false, error = "..." }.
-- Functions must stay top-level `function Name(...)` declarations so starlight can generate bindings.

local function call(name, ...)
    if not OEMT_APP then
        return { ok = false, error = "OEmt backend failed to start: " .. tostring(OEMT_BOOT_ERROR) }
    end
    return OEMT_APP.api[name](...)
end

---@ffi
---@return table
function OEmtGetOverview() return call("overview") end

---@ffi
---@param appid number
---@param instance number
---@param running boolean
---@return table
function OEmtSessionEvent(appid, instance, running) return call("session_event", appid, instance, running) end

---@ffi
---@param limit number
---@return table
function OEmtGetSessions(limit) return call("sessions", limit) end

---@ffi
---@return table
function OEmtClearSessions() return call("clear_sessions") end

---@ffi
---@param refresh boolean
---@return table
function OEmtGetIntegrations(refresh) return call("integrations", refresh) end

---@ffi
---@return table
function OEmtGetSettings() return call("settings") end

---@ffi
---@param key string
---@param value any
---@return table
function OEmtSetSetting(key, value) return call("set_setting", key, value) end

---@ffi
---@param key string
---@return table
function OEmtResetSettings(key) return call("reset_settings", key) end

---@ffi
---@return table
function OEmtExportSettings() return call("export_settings") end

---@ffi
---@param text string
---@return table
function OEmtImportSettings(text) return call("import_settings", text) end

---@ffi
---@return table
function OEmtGetDiagnostics() return call("diagnostics") end

---@ffi
---@param limit number
---@param min_level string
---@return table
function OEmtGetLogs(limit, min_level) return call("logs", limit, min_level) end

---@ffi
---@return table
function OEmtRunSelfTest() return call("self_test") end

---@ffi
---@param frontend_json string
---@return table
function OEmtExportDiagnostics(frontend_json) return call("export_diagnostics", frontend_json) end

---@ffi
---@param limit number
---@return table
function OEmtGetIpLog(limit) return call("ip_log", limit) end

---@ffi
---@param reason string
---@param appid string
---@return table
function OEmtCheckIp(reason, appid) return call("ip_check", reason, appid) end

---@ffi
---@return table
function OEmtClearIpLog() return call("ip_clear") end

---@ffi
---@param level string
---@param event string
---@param message string
---@return table
function OEmtFrontendLog(level, event, message) return call("frontend_log", level, event, message) end

---@ffi
---@return table
function OEmtIntegrationTick() return call("integration_tick") end

---@ffi
---@return table
function OEmtDiscordTest() return call("discord_test") end


---@ffi
---@return table
function OEmtPlayerStatus() return call("player_status") end

---@ffi
---@param key string
---@return table
function OEmtPlayerCover(key) return call("player_cover", key) end

---@ffi
---@param action string
---@param value number
---@return table
function OEmtPlayerCommand(action, value) return call("player_command", action, value) end
