local vdf = require("core.vdf")

T.test("parses nested blocks, escapes and comments", function()
    local d = assert(vdf.parse([[
// comment
"root"
{
	"path"	"C:\\Games\\Steam"   // trailing
	"quote"	"say \"hi\""
	"child" { "k" "v" }
	unquoted value
}]]))
    T.eq(d.root.path, "C:\\Games\\Steam")
    T.eq(d.root.quote, 'say "hi"')
    T.eq(d.root.child.k, "v")
    T.eq(d.root.unquoted, "value")
end)

T.test("case-insensitive lookup", function()
    local d = assert(vdf.parse('"AppState" { "StateFlags" "4" }'))
    T.eq(vdf.get(vdf.get(d, "appstate"), "stateflags"), "4")
end)

T.test("strips BOM and skips conditionals", function()
    local d = assert(vdf.parse('\239\187\191"a" { "b" "1" [$WIN32] }'))
    T.eq(d.a.b, "1")
end)

T.test("reports errors for malformed input", function()
    for _, bad in ipairs({ '"a" {', '"a"', '}', '"a" "unterminated', '"a" { "b" }' }) do
        local d, err = vdf.parse(bad)
        T.eq(d, nil, bad)
        T.truthy(err)
    end
end)
