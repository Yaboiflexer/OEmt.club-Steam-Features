-- Small Windows bindings through LuaJIT's FFI (the plugin host is LuaJIT with ffi enabled): named
-- pipes, for Discord's local Rich Presence connection (\\.\pipe\discord-ipc-N).
-- Everything else in OEmt receives these through `services.win32`, so tests use fakes.
-- On non-Windows hosts, or without ffi, `available` is false and every function is a no-op.
local M = { available = false }

local ok, ffi = pcall(require, "ffi")
if not ok or type(ffi) ~= "table" or ffi.os ~= "Windows" then return M end

local cdef_ok = pcall(ffi.cdef, [[
typedef void* OEMT_HANDLE;
OEMT_HANDLE CreateFileA(const char* name, unsigned long access, unsigned long share, void* sa,
                        unsigned long disposition, unsigned long flags, OEMT_HANDLE tmpl);
int WriteFile(OEMT_HANDLE h, const void* buf, unsigned long n, unsigned long* written, void* ov);
int ReadFile(OEMT_HANDLE h, void* buf, unsigned long n, unsigned long* read, void* ov);
int PeekNamedPipe(OEMT_HANDLE h, void* buf, unsigned long n, unsigned long* read, unsigned long* avail, unsigned long* left);
int CloseHandle(OEMT_HANDLE h);
void Sleep(unsigned long ms);
unsigned long GetCurrentProcessId(void);
]])
if not cdef_ok then return M end

local C = ffi.C
M.available = true

local GENERIC_RW = 0xC0000000
local OPEN_EXISTING = 3

local function invalid(h) return h == nil or tonumber(ffi.cast("intptr_t", h)) == -1 end

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

return M
