local Accounts = require("modules.accounts")
local json = require("core.jsonlite")
local S = require("stubs")

local LOGINUSERS = [["users"
{
	"76561198000000001"
	{
		"AccountName"		"mainaccount"
		"PersonaName"		"Main"
		"RememberPassword"		"1"
		"MostRecent"		"1"
		"Timestamp"		"1760000000"
	}
	"76561198000000002"
	{
		"AccountName"		"altacct"
		"PersonaName"		"Alt"
		"RememberPassword"		"0"
		"AllowAutoLogin"		"1"
		"MostRecent"		"0"
		"Timestamp"		"1750000000"
	}
	"not-a-steamid"
	{
		"AccountName"		"junk"
	}
}
]]

local function mem(text)
	local st = { text = text }
	st.load = function() return st.text end
	st.save = function(t) st.text = t return true end
	st.clear = function() st.text = nil end
	return st
end

local function make(opts)
	opts = opts or {}
	local files = { ["C:/Steam/config/loginusers.vdf"] = LOGINUSERS }
	if opts.tcno ~= false then files["C:/Program Files/TcNo Account Switcher/TcNo-Acc-Switcher.exe"] = "MZ" end
	local v = S.vfs(files)
	local ran = {}
	local acc = Accounts.new({
		steam_path = "C:/Steam", read_file = v.read_file, exists = v.exists,
		getenv = function(k) return k == "ProgramFiles" and "C:/Program Files" or nil end,
		exec = function(cmd) ran[#ran + 1] = cmd return "", 0 end,
		clock = function() return opts.now or 1000 end,
		store_labels = opts.labels or mem(), store_pending = opts.pending or mem(),
	})
	acc:load()
	return acc, ran
end

T.test("lists remembered accounts without exposing login names", function()
	local acc = make()
	local list = acc:list()
	T.eq(#list, 2)
	T.eq(list[1].steamid, "76561198000000001"); T.eq(list[1].most_recent, true); T.eq(list[1].persona_name, "Main")
	T.eq(list[1].account_masked, "ma*******nt")
	T.eq(list[2].remembered, true, "AllowAutoLogin counts as remembered")
	for _, a in ipairs(list) do T.eq(a.account_name, nil) end
end)

T.test("switch builds a detached TcNo command with optional status", function()
	local acc, ran = make()
	T.truthy(acc:switch("76561198000000002", { state = "invisible" }))
	T.eq(ran[1], 'start "" "C:\\Program Files\\TcNo Account Switcher\\TcNo-Acc-Switcher.exe" +s:76561198000000002:7')
	acc:switch("76561198000000002", {})
	T.contains(ran[2], "+s:76561198000000002")
	T.not_contains(ran[2], "+s:76561198000000002:")
end)

T.test("switch refuses bad input, unknown accounts and missing TcNo", function()
	local acc, ran = make()
	T.eq(acc:switch("76561198000000002 & calc", {}), nil)
	T.eq(acc:switch("76561198000000009", {}), nil)
	local _, e = acc:switch("76561198000000002", { state = "dancing" }); T.contains(e, "unknown status")
	local _, e2 = acc:switch("76561198000000002", { launch_appid = "1;rm" }); T.contains(e2, "invalid app id")
	T.eq(#ran, 0, "nothing executed")
	local noTcno = make({ tcno = false })
	local _, e3 = noTcno:switch("76561198000000002", {}); T.contains(e3, "not found")
end)

T.test("switch-then-launch hands the game over once, to the right account only", function()
	local pending = mem()
	local acc = make({ pending = pending, now = 1000 })
	acc:switch("76561198000000001", { launch_appid = "730" })
	T.eq(json.decode(pending.text).appid, "730")
	-- after restart: account 1 is MostRecent, within TTL
	local after = make({ pending = pending, now = 1100 })
	T.eq(after:take_pending_launch().appid, "730")
	T.eq(after:take_pending_launch(), nil, "consumed")
	-- wrong account
	acc:switch("76561198000000002", { launch_appid = "730" })
	T.eq(make({ pending = pending, now = 1100 }):take_pending_launch().wrong_account, true)
	-- expired
	acc:switch("76561198000000001", { launch_appid = "730" })
	T.eq(make({ pending = pending, now = 1000 + Accounts.PENDING_TTL_S + 1 }):take_pending_launch().expired, true)
end)

T.test("labels persist and are sanitised", function()
	local labels = mem()
	local acc = make({ labels = labels })
	T.truthy(acc:set_label("76561198000000002", "Alt\n account"))
	local again = make({ labels = labels })
	T.eq(again:list()[2].label, "Alt account")
	T.falsy(acc:set_label("nope", "x"))
end)
