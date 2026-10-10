-- Small Windows bindings through LuaJIT's FFI (the plugin host is LuaJIT with ffi enabled):
--   * named pipes, for Discord's local Rich Presence connection (\\.\pipe\discord-ipc-N);
--   * window titles of chosen programs only (e.g. Spotify.exe, browsers), for "now playing";
--   * media keys (play/pause, next, previous), which Windows routes to the active media player.
-- Everything else in OEmt receives these through `services.win32`, so tests use fakes.
-- On non-Windows hosts, or without ffi, `available` is false and every function is a no-op.
local M = { available = false }

local ok, ffi = pcall(require, "ffi")
if not ok or type(ffi) ~= "table" or ffi.os ~= "Windows" then return M end

local cdef_ok = pcall(ffi.cdef, [[
typedef void* OEMT_HANDLE;
typedef int (__stdcall *OEMT_WNDENUMPROC)(void* hwnd, intptr_t lparam);
OEMT_HANDLE CreateFileA(const char* name, unsigned long access, unsigned long share, void* sa,
                        unsigned long disposition, unsigned long flags, OEMT_HANDLE tmpl);
int WriteFile(OEMT_HANDLE h, const void* buf, unsigned long n, unsigned long* written, void* ov);
int ReadFile(OEMT_HANDLE h, void* buf, unsigned long n, unsigned long* read, void* ov);
int PeekNamedPipe(OEMT_HANDLE h, void* buf, unsigned long n, unsigned long* read, unsigned long* avail, unsigned long* left);
int CloseHandle(OEMT_HANDLE h);
void Sleep(unsigned long ms);
unsigned long GetCurrentProcessId(void);
int EnumWindows(OEMT_WNDENUMPROC cb, intptr_t lparam);
int GetWindowTextW(void* hwnd, uint16_t* buf, int max);
int GetWindowTextLengthW(void* hwnd);
int IsWindowVisible(void* hwnd);
unsigned long GetWindowThreadProcessId(void* hwnd, unsigned long* pid);
OEMT_HANDLE OpenProcess(unsigned long access, int inherit, unsigned long pid);
int QueryFullProcessImageNameW(OEMT_HANDLE h, unsigned long flags, uint16_t* buf, unsigned long* size);
int WideCharToMultiByte(unsigned int cp, unsigned long flags, const uint16_t* w, int wn, char* out, int on, const char* d, int* used);
void keybd_event(uint8_t vk, uint8_t scan, unsigned long flags, uintptr_t extra);
]])
if not cdef_ok then return M end

local C = ffi.C
M.available = true

local GENERIC_RW = 0xC0000000
local OPEN_EXISTING = 3
local PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
local CP_UTF8 = 65001

local function invalid(h) return h == nil or tonumber(ffi.cast("intptr_t", h)) == -1 end

local function utf8(wbuf, wlen)
    if wlen <= 0 then return "" end
    local n = C.WideCharToMultiByte(CP_UTF8, 0, wbuf, wlen, nil, 0, nil, nil)
    if n <= 0 then return "" end
    local out = ffi.new("char[?]", n)
    C.WideCharToMultiByte(CP_UTF8, 0, wbuf, wlen, out, n, nil, nil)
    return ffi.string(out, n)
end

function M.pid() return tonumber(C.GetCurrentProcessId()) end
function M.sleep(ms) C.Sleep(ms) end

--- Open a named pipe. Returns a connection { write, read_available, close } or nil.
function M.pipe_open(name)
    local h = C.CreateFileA(name, GENERIC_RW, 0, nil, OPEN_EXISTING, 0, nil)
    if invalid(h) then return nil end
    local closed = false
    local conn = {}
    function conn.write(data)
        if closed then return false, "closed" end
        local written = ffi.new("unsigned long[1]")
        local okw = C.WriteFile(h, data, #data, written, nil)
        if okw == 0 or written[0] ~= #data then return false, "write failed" end
        return true
    end
    --- Everything that is waiting in the pipe right now ("" if nothing), or nil, err when the pipe broke.
    function conn.read_available()
        if closed then return nil, "closed" end
        local avail = ffi.new("unsigned long[1]")
        if C.PeekNamedPipe(h, nil, 0, nil, avail, nil) == 0 then return nil, "pipe closed" end
        if avail[0] == 0 then return "" end
        local n = math.min(avail[0], 65536)
        local buf = ffi.new("uint8_t[?]", n)
        local got = ffi.new("unsigned long[1]")
        if C.ReadFile(h, buf, n, got, nil) == 0 then return nil, "read failed" end
        return ffi.string(buf, got[0])
    end
    function conn.close()
        if not closed then closed = true; C.CloseHandle(h) end
    end
    return conn
end

local exe_cache, exe_cache_at = {}, 0

local function exe_of(pid)
    local now = os.time()
    if now - exe_cache_at > 60 then exe_cache, exe_cache_at = {}, now end
    local cached = exe_cache[pid]
    if cached ~= nil then return cached end
    local name = false
    local h = C.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
    if not invalid(h) then
        local buf = ffi.new("uint16_t[1024]")
        local size = ffi.new("unsigned long[1]", 1024)
        if C.QueryFullProcessImageNameW(h, 0, buf, size) ~= 0 then
            local full = utf8(buf, tonumber(size[0]))
            name = (full:match("([^\\/]+)$") or full):lower()
        end
        C.CloseHandle(h)
    end
    exe_cache[pid] = name
    return name
end

-- EnumWindows calls back into Lua. One permanent callback (LuaJIT has a limited number of callback
-- slots) that forwards to the current collector; JIT is turned off for the code around the C call,
-- as LuaJIT requires for callbacks that can run while a trace is active.
local collect = nil
local pidbuf = ffi.new("unsigned long[1]")
local function on_window(hwnd)
    if collect then collect(hwnd) end
    return 1
end
if jit then jit.off(on_window) end
local enum_cb = ffi.cast("OEMT_WNDENUMPROC", on_window)

--- Titles of visible top-level windows whose program is in `exes` (set of lower-case file names).
--- Windows of any other program are skipped without reading their title.
function M.window_titles(exes)
    local out = {}
    collect = function(hwnd)
        if C.IsWindowVisible(hwnd) ~= 0 then
            C.GetWindowThreadProcessId(hwnd, pidbuf)
            local exe = exe_of(tonumber(pidbuf[0]))
            if exe and exes[exe] then
                local len = C.GetWindowTextLengthW(hwnd)
                if len > 0 then
                    local buf = ffi.new("uint16_t[?]", len + 1)
                    local n = C.GetWindowTextW(hwnd, buf, len + 1)
                    if n > 0 then out[#out + 1] = { exe = exe, title = utf8(buf, n) } end
                end
            end
        end
    end
    local okc = pcall(C.EnumWindows, enum_cb, 0)
    collect = nil
    if not okc then return {} end
    return out
end
if jit then jit.off(M.window_titles, true) end

M.MEDIA_KEYS = { play_pause = 0xB3, next = 0xB0, previous = 0xB1 }

--- Press a media key. Windows sends it to the app that currently owns media playback.
function M.media_key(action)
    local vk = M.MEDIA_KEYS[action]
    if not vk then return false end
    C.keybd_event(vk, 0, 1, 0)       -- KEYEVENTF_EXTENDEDKEY
    C.keybd_event(vk, 0, 1 + 2, 0)   -- + KEYEVENTF_KEYUP
    return true
end

return M
