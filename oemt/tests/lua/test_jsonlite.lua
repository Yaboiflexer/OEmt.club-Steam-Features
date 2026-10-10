local json = require("core.jsonlite")
local util = require("core.util")

T.test("encodes scalars and nested values deterministically", function()
    T.eq(json.encode({ b = 1, a = "x", c = { true, false } }), '{"a":"x","b":1,"c":[true,false]}')
end)

T.test("escapes control characters and quotes", function()
    T.eq(json.encode("a\"b\\c\n\1"), '"a\\"b\\\\c\\n\\u0001"')
end)

T.test("empty array marker encodes as []", function()
    T.eq(json.encode(util.array({})), "[]")
    T.eq(json.encode({}), "{}")
end)

T.test("non-finite numbers become null", function()
    T.eq(json.encode({ x = 0/0 }), '{"x":null}')
end)

T.test("round-trips unicode escapes including surrogate pairs", function()
    local v = json.decode('"caf\\u00e9 \\ud83c\\udfae"')
    T.eq(v, "café 🎮")
end)

T.test("decodes nested documents", function()
    local v = json.decode(' { "a" : [1, 2.5, -3e2, "s", null, true], "b": {} } ')
    T.eq(v.a[1], 1); T.eq(v.a[2], 2.5); T.eq(v.a[3], -300); T.eq(v.a[4], "s"); T.eq(v.a[6], true)
    T.eq(type(v.b), "table")
end)

T.test("keeps null positions in arrays on round-trip", function()
    T.eq(json.encode(json.decode("[1,null,3]")), "[1,null,3]")
    T.eq(json.encode(json.decode("[null]")), "[null]")
end)

T.test("rejects malformed input without throwing", function()
    for _, bad in ipairs({ "", "{", "[1,]", '{"a" 1}', "nul", '"unterminated', "{} extra", 42 }) do
        local v, err = json.decode(bad)
        T.eq(v, nil, "input " .. tostring(bad))
        T.truthy(err, "error message expected for " .. tostring(bad))
    end
end)

T.test("detects cycles on encode", function()
    local t = {}; t.self = t
    local ok = pcall(json.encode, t)
    T.falsy(ok)
end)
