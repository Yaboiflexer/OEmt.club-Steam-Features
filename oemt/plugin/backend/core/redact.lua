-- Redaction for anything that leaves memory: log files, diagnostics exports, UI log views.
local M = {}

M.SENSITIVE_KEY_PATTERNS = {
    "pass", "pwd", "pin", "token", "secret", "cookie", "auth", "session_?key", "sessionid",
    "credential", "apikey", "api_key", "private", "refresh", "bearer", "steamid", "account_?id",
}

local REDACTED = "[redacted]"

function M.is_sensitive_key(key)
    if type(key) ~= "string" then return false end
    local k = key:lower()
    -- "pin" must match as a whole word segment, otherwise "ping"/"spinner" would be redacted.
    if k == "pin" or k:match("^pin[_%-]") or k:match("[_%-]pin$") or k:match("[_%-]pin[_%-]") then return true end
    for _, pat in ipairs(M.SENSITIVE_KEY_PATTERNS) do
        if pat ~= "pin" and k:find(pat) then return true end
    end
    return false
end

local home_patterns = nil

local function build_home_patterns()
    home_patterns = {}
    for _, var in ipairs({ "USERPROFILE", "HOME" }) do
        local v = os.getenv(var)
        if v and #v > 3 then
            local norm = v:gsub("\\", "/")
            home_patterns[#home_patterns + 1] = { raw = v, norm = norm, label = "%" .. var .. "%" }
        end
    end
end

local function plain_replace(s, find, repl)
    local out, i = {}, 1
    local lf, ls = find:lower(), s:lower()
    while true do
        local a, b = ls:find(lf, i, true)
        if not a then break end
        out[#out + 1] = s:sub(i, a - 1)
        out[#out + 1] = repl
        i = b + 1
    end
    out[#out + 1] = s:sub(i)
    return table.concat(out)
end

--- Redact a free-form string: URL query strings/fragments, bearer tokens, user-profile paths.
function M.string(s)
    if type(s) ~= "string" then return s end
    -- strip query + fragment from URLs
    s = s:gsub("(https?://[^%s%?#\"']+)[%?#][^%s\"']*", "%1?[redacted]")
    -- bearer / basic auth headers
    s = s:gsub("([Bb]earer%s+)[%w%-%._~%+/=]+", "%1" .. REDACTED)
    -- key=value pairs with sensitive keys
    s = s:gsub("([%w_%-]+)%s*([=:])%s*([^%s,;&\"']+)", function(k, sep, v)
        if M.is_sensitive_key(k) then return k .. sep .. REDACTED end
        return nil
    end)
    -- 17-digit SteamID64 values
    s = s:gsub("7656119%d%d%d%d%d%d%d%d%d%d", "[steamid]")
    -- IPv4 addresses (the IP log must never leak into logs or diagnostics exports)
    s = s:gsub("%f[%d]%d%d?%d?%.%d%d?%d?%.%d%d?%d?%.%d%d?%d?%f[^%d]", "[ip]")
    -- IPv6 addresses: 3+ colons or a "::" (clock times like 05:42:42 have two colons and no "::")
    s = s:gsub("%f[%x:][%x]*:[%x]*:[%x:]*%x%f[^%x:]", function(m)
        local colons = select(2, m:gsub(":", ""))
        return (colons >= 3 or m:find("::", 1, true)) and "[ip]" or m
    end)
    if not home_patterns then build_home_patterns() end
    for _, hp in ipairs(home_patterns) do
        s = plain_replace(s, hp.raw, hp.label)
        if hp.norm ~= hp.raw then s = plain_replace(s, hp.norm, hp.label) end
    end
    return s
end

--- Deep-redact a value. Tables are copied; sensitive keys are replaced.
function M.value(v, depth)
    depth = depth or 0
    if depth > 16 then return "[depth-limit]" end
    local t = type(v)
    if t == "string" then return M.string(v) end
    if t ~= "table" then return v end
    local out = {}
    for k, val in pairs(v) do
        if M.is_sensitive_key(k) then
            out[k] = REDACTED
        else
            out[k] = M.value(val, depth + 1)
        end
    end
    return setmetatable(out, getmetatable(v))
end

-- test hook
function M._reset_home_patterns() home_patterns = nil end

return M
