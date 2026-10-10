// oemt-media.exe: reads and controls Windows' system media session (the one the volume pop-up shows)
// for the OEmt.club player bar. Works with the Spotify app and browsers (SoundCloud, YouTube, …).
//
//   oemt-media status [app]          JSON: current session + all sessions (title, artist, album, state,
//                                    position, duration, shuffle, repeat, what the app allows)
//   oemt-media thumb [app]           JSON: { key, data_url } cover art of the session as a data: URL
//   oemt-media play_pause|next|previous|shuffle|repeat [app]
//   oemt-media seek <seconds> [app]
//   oemt-media volume <0-100>          set the system volume
//   oemt-media mute                    toggle mute
//
// [app] picks the session whose app id contains that text (e.g. "spotify"); default: the current one.
// Output is always one line of JSON on stdout. No network access, no files written.
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Media.h>
#include <winrt/Windows.Media.Control.h>
#include <winrt/Windows.Storage.Streams.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cwctype>
#include <string>
#include <vector>

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Media;
using namespace Windows::Media::Control;
using namespace Windows::Storage::Streams;

using Session = GlobalSystemMediaTransportControlsSession;

// System (default output device) volume through Core Audio.
static com_ptr<IAudioEndpointVolume> endpoint_volume()
{
    com_ptr<IMMDeviceEnumerator> en;
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), en.put_void()))) return nullptr;
    com_ptr<IMMDevice> dev;
    if (FAILED(en->GetDefaultAudioEndpoint(eRender, eConsole, dev.put()))) return nullptr;
    com_ptr<IAudioEndpointVolume> vol;
    if (FAILED(dev->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, vol.put_void()))) return nullptr;
    return vol;
}

static std::string volume_json()
{
    auto v = endpoint_volume();
    if (!v) return "null";
    float level = 0; BOOL muted = FALSE;
    v->GetMasterVolumeLevelScalar(&level);
    v->GetMute(&muted);
    char b[64];
    snprintf(b, sizeof b, "{\"level\":%d,\"muted\":%s}", (int)(level * 100.0f + 0.5f), muted ? "true" : "false");
    return b;
}

static std::string utf8(std::wstring_view w)
{
    if (w.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), s.data(), n, nullptr, nullptr);
    return s;
}

static std::string esc(std::wstring_view w)
{
    std::string in = utf8(w), out;
    out.reserve(in.size() + 8);
    for (unsigned char c : in) {
        switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); out += b; }
            else out += (char)c;
        }
    }
    return out;
}

static std::wstring lower(std::wstring s)
{
    std::transform(s.begin(), s.end(), s.begin(), [](wchar_t c) { return (wchar_t)std::towlower(c); });
    return s;
}

static double seconds(TimeSpan t) { return std::chrono::duration<double>(t).count(); }

static Session pick(GlobalSystemMediaTransportControlsSessionManager const& mgr, std::wstring const& app)
{
    if (app.empty()) return mgr.GetCurrentSession();
    std::wstring want = lower(app);
    for (auto const& s : mgr.GetSessions())
        if (lower(std::wstring(s.SourceAppUserModelId())).find(want) != std::wstring::npos) return s;
    return nullptr;
}

static const char* state_name(GlobalSystemMediaTransportControlsSessionPlaybackStatus st)
{
    switch (st) {
    case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing: return "playing";
    case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused: return "paused";
    case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped: return "stopped";
    case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Changing: return "changing";
    default: return "closed";
    }
}

static std::string describe(Session const& s)
{
    std::string j = "{\"app\":\"" + esc(s.SourceAppUserModelId()) + "\"";
    try {
        auto p = s.TryGetMediaPropertiesAsync().get();
        j += ",\"title\":\"" + esc(p.Title()) + "\",\"artist\":\"" + esc(p.Artist()) + "\",\"album\":\"" + esc(p.AlbumTitle()) + "\"";
        j += std::string(",\"has_thumb\":") + (p.Thumbnail() ? "true" : "false");
    } catch (...) {
        j += ",\"title\":\"\",\"artist\":\"\",\"album\":\"\",\"has_thumb\":false";
    }
    auto pb = s.GetPlaybackInfo();
    auto st = pb.PlaybackStatus();
    j += std::string(",\"state\":\"") + state_name(st) + "\"";
    if (auto sh = pb.IsShuffleActive()) j += std::string(",\"shuffle\":") + (sh.Value() ? "true" : "false");
    if (auto rp = pb.AutoRepeatMode()) {
        auto m = rp.Value();
        j += std::string(",\"repeat\":\"") + (m == MediaPlaybackAutoRepeatMode::Track ? "track" : m == MediaPlaybackAutoRepeatMode::List ? "list" : "none") + "\"";
    }
    auto c = pb.Controls();
    j += std::string(",\"can\":{\"play_pause\":") + (c.IsPlayPauseToggleEnabled() || c.IsPlayEnabled() || c.IsPauseEnabled() ? "true" : "false") +
         ",\"next\":" + (c.IsNextEnabled() ? "true" : "false") + ",\"previous\":" + (c.IsPreviousEnabled() ? "true" : "false") +
         ",\"seek\":" + (c.IsPlaybackPositionEnabled() ? "true" : "false") + ",\"shuffle\":" + (c.IsShuffleEnabled() ? "true" : "false") +
         ",\"repeat\":" + (c.IsRepeatEnabled() ? "true" : "false") + "}";
    auto tl = s.GetTimelineProperties();
    double start = seconds(tl.StartTime()), end = seconds(tl.EndTime()), pos = seconds(tl.Position());
    // Position is a snapshot taken at LastUpdatedTime; move it forward while playing.
    if (st == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing) {
        auto since = clock::now() - tl.LastUpdatedTime();
        double add = std::chrono::duration<double>(since).count();
        if (add > 0 && add < 24 * 3600) pos += add;
    }
    double dur = end - start;
    if (dur > 0) pos = std::clamp(pos - start, 0.0, dur);
    char b[96];
    snprintf(b, sizeof b, ",\"position\":%.2f,\"duration\":%.2f}", dur > 0 ? pos : 0.0, dur > 0 ? dur : 0.0);
    j += b;
    return j;
}

static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static std::string base64(std::vector<uint8_t> const& d)
{
    std::string o;
    o.reserve((d.size() + 2) / 3 * 4);
    for (size_t i = 0; i < d.size(); i += 3) {
        uint32_t v = d[i] << 16 | (i + 1 < d.size() ? d[i + 1] << 8 : 0) | (i + 2 < d.size() ? d[i + 2] : 0);
        o += B64[v >> 18 & 63];
        o += B64[v >> 12 & 63];
        o += i + 1 < d.size() ? B64[v >> 6 & 63] : '=';
        o += i + 2 < d.size() ? B64[v & 63] : '=';
    }
    return o;
}

static int out(std::string const& s)
{
    fwrite(s.data(), 1, s.size(), stdout);
    fputc('\n', stdout);
    return 0;
}

static int fail(const char* msg) { return out(std::string("{\"error\":\"") + msg + "\"}"), 1; }

int wmain(int argc, wchar_t** argv)
{
    try {
        init_apartment(apartment_type::multi_threaded);
        std::wstring cmd = argc > 1 ? argv[1] : L"status";
        auto mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();

        if (cmd == L"status") {
            std::wstring app = argc > 2 ? argv[2] : L"";
            std::string j = "{\"current\":";
            auto cur = pick(mgr, app);
            j += cur ? describe(cur) : "null";
            j += ",\"sessions\":[";
            bool first = true;
            for (auto const& s : mgr.GetSessions()) {
                if (!first) j += ",";
                first = false;
                j += describe(s);
            }
            return out(j + "],\"volume\":" + volume_json() + "}");
        }

        if (cmd == L"volume" || cmd == L"mute") {
            auto v = endpoint_volume();
            if (!v) return fail("no audio device");
            if (cmd == L"mute") {
                BOOL m = FALSE;
                v->GetMute(&m);
                v->SetMute(!m, nullptr);
            } else {
                if (argc < 3) return fail("volume needs 0-100");
                double lvl = std::clamp(_wtof(argv[2]), 0.0, 100.0);
                v->SetMasterVolumeLevelScalar((float)(lvl / 100.0), nullptr);
                if (lvl > 0) v->SetMute(FALSE, nullptr);
            }
            return out("{\"ok\":true,\"volume\":" + volume_json() + "}");
        }

        if (cmd == L"seek") {
            if (argc < 3) return fail("seek needs seconds");
            double secs = _wtof(argv[2]);
            auto s = pick(mgr, argc > 3 ? argv[3] : L"");
            if (!s) return fail("no media session");
            auto start = s.GetTimelineProperties().StartTime();
            int64_t ticks = start.count() + (int64_t)(std::max(0.0, secs) * 10'000'000.0);
            bool ok = s.TryChangePlaybackPositionAsync(ticks).get();
            return out(std::string("{\"ok\":") + (ok ? "true" : "false") + "}");
        }

        auto s = pick(mgr, argc > 2 ? argv[2] : L"");
        if (!s) return fail("no media session");

        if (cmd == L"thumb") {
            auto p = s.TryGetMediaPropertiesAsync().get();
            auto ref = p.Thumbnail();
            if (!ref) return out("{\"data_url\":null}");
            auto stream = ref.OpenReadAsync().get();
            auto size = (uint32_t)std::min<uint64_t>(stream.Size(), 4 * 1024 * 1024);
            Buffer buf(size);
            auto got = stream.ReadAsync(buf, size, InputStreamOptions::None).get();
            std::vector<uint8_t> bytes(got.data(), got.data() + got.Length());
            std::wstring type{ stream.ContentType() };
            if (type.empty()) type = L"image/png";
            return out("{\"key\":\"" + esc(p.Title()) + "|" + esc(p.Artist()) + "\",\"data_url\":\"data:" + esc(type) + ";base64," + base64(bytes) + "\"}");
        }

        bool ok = false;
        if (cmd == L"play_pause") ok = s.TryTogglePlayPauseAsync().get();
        else if (cmd == L"next") ok = s.TrySkipNextAsync().get();
        else if (cmd == L"previous") ok = s.TrySkipPreviousAsync().get();
        else if (cmd == L"shuffle") {
            auto cur = s.GetPlaybackInfo().IsShuffleActive();
            ok = s.TryChangeShuffleActiveAsync(!(cur && cur.Value())).get();
        } else if (cmd == L"repeat") {
            auto cur = s.GetPlaybackInfo().AutoRepeatMode();
            auto m = cur ? cur.Value() : MediaPlaybackAutoRepeatMode::None;
            auto next = m == MediaPlaybackAutoRepeatMode::None ? MediaPlaybackAutoRepeatMode::List
                      : m == MediaPlaybackAutoRepeatMode::List ? MediaPlaybackAutoRepeatMode::Track
                      : MediaPlaybackAutoRepeatMode::None;
            ok = s.TryChangeAutoRepeatModeAsync(next).get();
        } else return fail("unknown command");
        return out(std::string("{\"ok\":") + (ok ? "true" : "false") + "}");
    } catch (hresult_error const& e) {
        return out("{\"error\":\"" + esc(e.message()) + "\"}"), 1;
    } catch (...) {
        return fail("unexpected error");
    }
}
