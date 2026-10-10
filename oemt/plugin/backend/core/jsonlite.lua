-- Minimal, dependency-free JSON encode/decode used for OEmt's own files
-- (sessions, settings export, diagnostics bundles). Deterministic key order on encode.
local M = {}

local escapes = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function esc(s)
    return (s:gsub('[%c"\\]', function(c)
        return escapes[c] or string.format("\\u%04x", c:byte())
    end))
end

local function is_array(t)
    local mt = getmetatable(t)
    if mt and mt.__jsontype == "array" then return true end
    if mt and mt.__jsontype == "object" then return false end
    local n = 0
    for k in pairs(t) do
        if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then return false end
        n = n + 1
    end
    if n == 0 then return false end
    for i = 1, n do if t[i] == nil then return false end end
    return true
end

local encode

local function encode_value(v, depth, seen)
    local tv = type(v)
    if v == nil then return "null"
    elseif tv == "boolean" then return v and "true" or "false"
    elseif tv == "number" then
        if v ~= v or v == math.huge or v == -math.huge then return "null" end
        if v % 1 == 0 and v > -1e15 and v < 1e15 then return string.format("%d", v) end
        return string.format("%.14g", v)
    elseif tv == "string" then return '"' .. esc(v) .. '"'
    elseif tv == "table" then
        if depth > 64 then error("json: nesting too deep") end
        if seen[v] then error("json: cycle detected") end
        seen[v] = true
        local out = {}
        if is_array(v) then
            local mt = getmetatable(v)
            local n = (mt and mt.n) or #v
            for i = 1, n do out[i] = encode_value(v[i], depth + 1, seen) end
            seen[v] = nil
            return "[" .. table.concat(out, ",") .. "]"
        end
        local keys = {}
        for k in pairs(v) do keys[#keys + 1] = tostring(k) end
        table.sort(keys)
        for _, k in ipairs(keys) do
            local val = v[k]
            if val == nil then val = v[tonumber(k)] end
            if type(val) ~= "function" then
                out[#out + 1] = '"' .. esc(k) .. '":' .. encode_value(val, depth + 1, seen)
            end
        end
        seen[v] = nil
        return "{" .. table.concat(out, ",") .. "}"
    end
    return "null"
end

encode = function(v) return encode_value(v, 0, {}) end
M.encode = encode

-- Decoder -------------------------------------------------------------------

local function decode_error(str, i, msg)
    error(string.format("json: %s at position %d", msg, i), 0)
end

local function skip_ws(str, i)
    local _, e = str:find("^[ \n\r\t]*", i)
    return e + 1
end

local decode_value

local function utf8_char(cp)
    if cp < 0x80 then return string.char(cp)
    elseif cp < 0x800 then return string.char(0xC0 + math.floor(cp / 0x40), 0x80 + cp % 0x40)
    elseif cp < 0x10000 then
        return string.char(0xE0 + math.floor(cp / 0x1000), 0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
    end
    return string.char(0xF0 + math.floor(cp / 0x40000), 0x80 + math.floor(cp / 0x1000) % 0x40,
        0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
end

local function decode_string(str, i)
    local out, j = {}, i + 1
    while true do
        local c = str:sub(j, j)
        if c == "" then decode_error(str, j, "unterminated string") end
        if c == '"' then return table.concat(out), j + 1 end
        if c == "\\" then
            local n = str:sub(j + 1, j + 1)
            local map = { b = "\b", f = "\f", n = "\n", r = "\r", t = "\t", ['"'] = '"', ["\\"] = "\\", ["/"] = "/" }
            if map[n] then out[#out + 1] = map[n]; j = j + 2
            elseif n == "u" then
                local hex = str:sub(j + 2, j + 5)
                if not hex:match("^%x%x%x%x$") then decode_error(str, j, "bad unicode escape") end
                local cp = tonumber(hex, 16)
                j = j + 6
                if cp >= 0xD800 and cp <= 0xDBFF and str:sub(j, j + 1) == "\\u" then
                    local lo = tonumber(str:sub(j + 2, j + 5), 16)
                    if lo and lo >= 0xDC00 and lo <= 0xDFFF then
                        cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
                        j = j + 6
                    end
                end
                out[#out + 1] = utf8_char(cp)
            else decode_error(str, j, "bad escape") end
        else
            out[#out + 1] = c
            j = j + 1
        end
    end
end

decode_value = function(str, i, depth)
    if depth > 64 then decode_error(str, i, "nesting too deep") end
    i = skip_ws(str, i)
    local c = str:sub(i, i)
    if c == "{" then
        local obj = {}
        i = skip_ws(str, i + 1)
        if str:sub(i, i) == "}" then return setmetatable(obj, { __jsontype = "object" }), i + 1 end
        while true do
            i = skip_ws(str, i)
            if str:sub(i, i) ~= '"' then decode_error(str, i, "expected string key") end
            local key
            key, i = decode_string(str, i)
            i = skip_ws(str, i)
            if str:sub(i, i) ~= ":" then decode_error(str, i, "expected ':'") end
            local val
            val, i = decode_value(str, i + 1, depth + 1)
            obj[key] = val
            i = skip_ws(str, i)
            local d = str:sub(i, i)
            if d == "}" then return obj, i + 1 end
            if d ~= "," then decode_error(str, i, "expected ',' or '}'") end
            i = i + 1
        end
    elseif c == "[" then
        -- Track the length explicitly: `arr[#arr + 1] = nil` is a no-op, so a
        -- null element would otherwise shift every later element left.
        local mt = { __jsontype = "array", n = 0 }
        local arr = setmetatable({}, mt)
        i = skip_ws(str, i + 1)
        if str:sub(i, i) == "]" then return arr, i + 1 end
        while true do
            local val
            val, i = decode_value(str, i, depth + 1)
            mt.n = mt.n + 1
            arr[mt.n] = val
            i = skip_ws(str, i)
            local d = str:sub(i, i)
            if d == "]" then return arr, i + 1 end
            if d ~= "," then decode_error(str, i, "expected ',' or ']'") end
            i = i + 1
        end
    elseif c == '"' then
        return decode_string(str, i)
    elseif str:sub(i, i + 3) == "true" then return true, i + 4
    elseif str:sub(i, i + 4) == "false" then return false, i + 5
    elseif str:sub(i, i + 3) == "null" then return nil, i + 4
    else
        local num = str:match("^-?%d+%.?%d*[eE]?[-+]?%d*", i)
        if not num or num == "" or num == "-" then decode_error(str, i, "unexpected character") end
        local n = tonumber(num)
        if not n then decode_error(str, i, "bad number") end
        return n, i + #num
    end
end

--- Decode a JSON string. Returns value or nil, err (never throws).
function M.decode(str)
    if type(str) ~= "string" then return nil, "json: input is not a string" end
    local ok, val, pos = pcall(decode_value, str, 1, 0)
    if not ok then return nil, val end
    pos = skip_ws(str, pos)
    if pos <= #str then return nil, "json: trailing data at position " .. pos end
    return val
end

return M
