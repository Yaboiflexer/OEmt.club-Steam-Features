// Typed wrappers around the Lua FFI. Every backend call returns an envelope
// { ok: true, data } | { ok: false, error }; these helpers unwrap it and throw ApiError on failure.

export class ApiError extends Error {}

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface Check { id: string; label: string; status: CheckStatus; detail: string }

export interface Session {
	id: number; appid: string; instance: number; name?: string;
	started_at: number; ended_at?: number; duration_s?: number;
	status: 'running' | 'ended' | 'interrupted';
	/** Insights recordings made during this session (only when the Insights integration is on). */
	clips?: Recording[];
}

export interface Overview {
	version: string; millennium_version: string; health: CheckStatus; checks: Check[];
	library?: { apps: number; libraries: number; warnings: number; scanned_at: number };
	active_sessions: Session[];
	settings: { accent: string; reduced_motion: boolean; default_tab: string; open_on_start: boolean };
}

export interface SessionsData { active: Session[]; history: Session[]; enabled: boolean; interrupted_on_load?: number }

export type CapabilityStatus = 'available' | 'planned' | 'unsupported';
export interface Integration {
	id: string; name: string; phase: number; enabled: boolean;
	detection: { installed: boolean; status: string; variant?: string; detail?: string };
	capabilities: { id: string; label: string; status: CapabilityStatus; note?: string }[];
}

export interface NowPlaying { source: 'spotify' | 'soundcloud'; artist?: string; title: string }
export interface Recording { name: string; path: string; size: number; mtime: number }
export interface InsightsStatus {
	installed: boolean; variant?: string; running?: boolean; enabled: boolean; auto_start: boolean;
	recordings_dir?: string; recordings: Recording[]; recordings_total: number;
}
export interface MediaItem { id: string; source: 'spotify' | 'soundcloud'; kind: string; ref: string; url: string; title: string; added_at: number }
export type MediaAction = 'play_pause' | 'next' | 'previous';
/** Live state from backend/modules/integrations_live.lua. */
export interface LiveStatus {
	available: boolean;
	discord: { enabled: boolean; configured: boolean; connected: boolean; error?: string; retry_at?: number; showing: boolean };
	now_playing?: NowPlaying;
	music_enabled: boolean;
}

export type SettingType = 'bool' | 'int' | 'enum' | 'color' | 'string';
export interface SettingField {
	key: string; type: SettingType; default: unknown; min?: number; max?: number;
	values?: string[]; labels?: Record<string, string>; label: string; group: string;
}
export interface ConfigIssue { key: string; problem: string; action?: string }
export interface SettingsData { values: Record<string, unknown>; schema: SettingField[]; issues: ConfigIssue[] }

export interface ModuleHealth {
	id: string; name: string; version?: string; state: string; status: string; detail?: string; error?: string; start_ms?: number;
}
export interface Diagnostics {
	oemt_version: string; millennium_version: string; overall: CheckStatus; checks: Check[];
	modules: ModuleHealth[]; config_issues: ConfigIssue[];
	log: { level: string; total: number; file_bytes: number; max_bytes: number; max_files: number; file_errors: number; last_file_error?: string };
	performance: {
		backend_heap_kb: number; uptime_s: number; startup_ms?: number; log_disk_bytes: number;
		calls: { name: string; count: number; errors: number; avg_ms: number; max_ms: number }[];
		library_scan_ms?: number; note: string;
	};
	generated_at: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
	ts: string; level: LogLevel; module: string; event: string; outcome?: string;
	duration_ms?: number; msg?: string; error?: string; data?: unknown;
}

export interface IpChange { ip: string; first_seen: number; last_seen: number; checks: number; reason: string }
export interface IpSession { at: number; appid: string; name?: string; ip: string; fresh: boolean }
export interface IpLogData {
	enabled: boolean; check_minutes: number; current?: IpChange; changes: IpChange[]; sessions: IpSession[];
	last_error?: string; save_error?: string; load_error?: string;
}

export interface SelfTest { passed: number; total: number; ran_at: string; results: { name: string; ok: boolean; detail: string; duration_ms: number }[] }

/** Millennium's Lua->JSON bridge can emit an empty Lua table as {} where an array is expected. */
export function arr<T>(v: unknown): T[] {
	if (Array.isArray(v)) return v as T[];
	return [];
}

function decode(raw: unknown): unknown {
	if (typeof raw !== 'string') return raw;
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

async function call<T>(name: string, p: Promise<unknown>): Promise<T> {
	const env = decode(await p) as { ok?: boolean; data?: unknown; error?: string } | null;
	if (!env || typeof env !== 'object' || typeof env.ok !== 'boolean') {
		throw new ApiError(`${name}: unexpected response from the OEmt backend`);
	}
	if (!env.ok) throw new ApiError(env.error || `${name} failed`);
	return env.data as T;
}

export const api = {
	async overview(): Promise<Overview> {
		const o = await call<Overview>('overview', backend.OEmtGetOverview());
		return { ...o, checks: arr(o.checks), active_sessions: arr(o.active_sessions) };
	},
	sessionEvent: (appid: number, instance: number, running: boolean) =>
		call<{ tracked: boolean; reason?: string }>('session_event', backend.OEmtSessionEvent(appid, instance, running)),
	async sessions(limit = 100): Promise<SessionsData> {
		const s = await call<SessionsData>('sessions', backend.OEmtGetSessions(limit));
		return { ...s, active: arr(s.active), history: arr<Session>(s.history).map((h) => (h.clips ? { ...h, clips: arr(h.clips) } : h)) };
	},
	clearSessions: () => call<boolean>('clear_sessions', backend.OEmtClearSessions()),
	integrationTick: () => call<LiveStatus>('integration_tick', backend.OEmtIntegrationTick()),
	mediaControl: (action: MediaAction) => call<boolean>('media_control', backend.OEmtMediaControl(action)),
	discordTest: () => call<LiveStatus>('discord_test', backend.OEmtDiscordTest()),
	async insightsStatus(force = false): Promise<InsightsStatus> {
		const s = await call<InsightsStatus>('insights_status', backend.OEmtInsightsStatus(force));
		return { ...s, recordings: arr(s.recordings) };
	},
	mediaList: async () => arr<MediaItem>(await call<unknown>('media_list', backend.OEmtMediaList())),
	mediaAdd: async (url: string, title = '') => arr<MediaItem>(await call<unknown>('media_add', backend.OEmtMediaAdd(url, title))),
	mediaRemove: async (id: string) => arr<MediaItem>(await call<unknown>('media_remove', backend.OEmtMediaRemove(id))),
	mediaRename: async (id: string, title: string) => arr<MediaItem>(await call<unknown>('media_rename', backend.OEmtMediaRename(id, title))),
	insightsOpen: () => call<boolean>('insights_open', backend.OEmtInsightsOpen()),
	/** Show a recording in Explorer; empty path opens the recordings folder. */
	insightsReveal: (path = '') => call<boolean>('insights_reveal', backend.OEmtInsightsReveal(path)),
	async integrations(refresh = false): Promise<Integration[]> {
		const list = arr<Integration>(await call<unknown>('integrations', backend.OEmtGetIntegrations(refresh)));
		return list.map((i) => ({ ...i, capabilities: arr(i.capabilities) }));
	},
	async settings(): Promise<SettingsData> {
		const s = await call<SettingsData>('settings', backend.OEmtGetSettings());
		return { values: s.values ?? {}, schema: arr<SettingField>(s.schema).map((f) => ({ ...f, values: f.values ? arr(f.values) : undefined })), issues: arr(s.issues) };
	},
	setSetting: (key: string, value: unknown) => call<{ key: string; value: unknown }>('set_setting', backend.OEmtSetSetting(key, value)),
	resetSettings: (key = '') => call<Record<string, unknown>>('reset_settings', backend.OEmtResetSettings(key)),
	exportSettings: () => call<string>('export_settings', backend.OEmtExportSettings()),
	importSettings: (text: string) =>
		call<{ ok: boolean; applied: number; rejected: { key: string; reason: string }[] }>('import_settings', backend.OEmtImportSettings(text)).then((r) => ({
			...r,
			rejected: arr<{ key: string; reason: string }>(r.rejected),
		})),
	async diagnostics(): Promise<Diagnostics> {
		const d = await call<Diagnostics>('diagnostics', backend.OEmtGetDiagnostics());
		return {
			...d,
			checks: arr(d.checks),
			modules: arr(d.modules),
			config_issues: arr(d.config_issues),
			performance: { ...d.performance, calls: arr(d.performance?.calls) },
		};
	},
	logs: async (limit: number, minLevel: LogLevel) => arr<LogEntry>(await call<unknown>('logs', backend.OEmtGetLogs(limit, minLevel))),
	async selfTest(): Promise<SelfTest> {
		const r = await call<SelfTest>('self_test', backend.OEmtRunSelfTest());
		return { ...r, results: arr(r.results) };
	},
	async ipLog(limit = 200): Promise<IpLogData> {
		const d = await call<IpLogData>('ip_log', backend.OEmtGetIpLog(limit));
		return { ...d, changes: arr(d.changes), sessions: arr(d.sessions) };
	},
	checkIp: (reason: 'startup' | 'auto' | 'manual' | 'session_start', appid = '') =>
		call<{ ip?: string; changed?: boolean; skipped?: boolean; session?: IpSession }>('ip_check', backend.OEmtCheckIp(reason, appid)),
	clearIpLog: () => call<boolean>('ip_clear', backend.OEmtClearIpLog()),
	exportDiagnostics: (frontendInfo: object) => call<string>('export_diagnostics', backend.OEmtExportDiagnostics(JSON.stringify(frontendInfo))),
	/** Fire-and-forget; logging must never throw into the UI. */
	log(level: LogLevel, event: string, message: string) {
		try {
			backend.OEmtFrontendLog(level, event, message).catch(() => undefined);
		} catch {
			/* backend unavailable */
		}
	},
};
