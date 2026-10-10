-- Parser for Valve's text KeyValues format (libraryfolders.vdf, appmanifest_*.acf, ...).
-- Keys are lowercased lookups via M.get(); original keys are preserved in the table.
local M = {}

local function tokenize(text)
    local tokens, i, n, line = {}, 1, #text, 1
    while i <= n do
        local c = text:sub(i, i)
        if c == "\n" then line = line + 1; i = i + 1
        elseif c:match("%s") then i = i + 1
        elseif c == "/" and text:sub(i + 1, i + 1) == "/" then
            local e = text:find("\n", i, true)
            i = e or (n + 1)
        elseif c == "{" or c == "}" then
            tokens[#tokens + 1] = { t = c, line = line }
            i = i + 1
        elseif c == "[" then
            -- conditional like [$WIN32]; skip
            local e = text:find("]", i, true)
            if not e then return nil, "unterminated conditional on line " .. line end
            i = e + 1
        elseif c == '"' then
            local buf, j = {}, i + 1
            while true do
                local d = text:sub(j, j)
                if d == "" then return nil, "unterminated string on line " .. line end
                if d == "\\" then
                    local e = text:sub(j + 1, j + 1)
                    local map = { n = "\n", t = "\t", ['"'] = '"', ["\\"] = "\\" }
                    buf[#buf + 1] = map[e] or ("\\" .. e)
                    j = j + 2
                elseif d == '"' then break
                else
                    if d == "\n" then line = line + 1 end
                    buf[#buf + 1] = d
                    j = j + 1
                end
            end
            tokens[#tokens + 1] = { t = "s", v = table.concat(buf), line = line }
            i = j + 1
        else
            local s, e = text:find("^[^%s{}\"]+", i)
            tokens[#tokens + 1] = { t = "s", v = text:sub(s, e), line = line }
            i = e + 1
        end
    end
    return tokens
end

--- Parse KeyValues text. Returns table or nil, err.
function M.parse(text)
    if type(text) ~= "string" then return nil, "input is not a string" end
    -- strip UTF-8 BOM
    if text:sub(1, 3) == "\239\187\191" then text = text:sub(4) end
    local tokens, err = tokenize(text)
    if not tokens then return nil, err end
    local pos = 1
    local function parse_block(depth)
        if depth > 32 then error("nesting too deep", 0) end
        local obj = {}
        while pos <= #tokens do
            local tk = tokens[pos]
            if tk.t == "}" then
                if depth == 0 then error("unexpected '}' on line " .. tk.line, 0) end
                pos = pos + 1
                return obj
            end
            if tk.t ~= "s" then error("expected key on line " .. tk.line, 0) end
            local key = tk.v
            pos = pos + 1
            local nv = tokens[pos]
            if not nv then error("missing value for key '" .. key .. "'", 0) end
            if nv.t == "{" then
                pos = pos + 1
                obj[key] = parse_block(depth + 1)
            elseif nv.t == "s" then
                obj[key] = nv.v
                pos = pos + 1
            else
                error("unexpected '}' after key '" .. key .. "' on line " .. nv.line, 0)
            end
        end
        if depth > 0 then error("unexpected end of input (missing '}')", 0) end
        return obj
    end
    local ok, res = pcall(parse_block, 0)
    if not ok then return nil, res end
    return res
end

--- Case-insensitive child lookup (Valve files are inconsistent with casing).
function M.get(t, key)
    if type(t) ~= "table" then return nil end
    if t[key] ~= nil then return t[key] end
    local lk = key:lower()
    for k, v in pairs(t) do
        if type(k) == "string" and k:lower() == lk then return v end
    end
    return nil
end

return M
