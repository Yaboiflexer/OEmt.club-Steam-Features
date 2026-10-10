// `backend` is injected by starlight's frontend wrapper: one entry per `---@ffi` function in
// backend/oemt_ffi.lua, each calling window.MILLENNIUM_API.ffi(pluginName, name).
// Arities here must match the Lua signatures; starlight's FFI lint checks call sites against them.
// Return values arrive either as JSON text or as an already-decoded value; api.ts normalises both.
type FfiResult = Promise<unknown>;

declare const backend: {
	OEmtGetOverview(): FfiResult;
	OEmtSessionEvent(appid: number, instance: number, running: boolean): FfiResult;
	OEmtGetSessions(limit: number): FfiResult;
	OEmtClearSessions(): FfiResult;
	OEmtGetIntegrations(refresh: boolean): FfiResult;
	OEmtGetSettings(): FfiResult;
	OEmtSetSetting(key: string, value: unknown): FfiResult;
	OEmtResetSettings(key: string): FfiResult;
	OEmtExportSettings(): FfiResult;
	OEmtImportSettings(text: string): FfiResult;
	OEmtGetDiagnostics(): FfiResult;
	OEmtGetLogs(limit: number, min_level: string): FfiResult;
	OEmtRunSelfTest(): FfiResult;
	OEmtExportDiagnostics(frontend_json: string): FfiResult;
	OEmtGetIpLog(limit: number): FfiResult;
	OEmtCheckIp(reason: string, appid: string): FfiResult;
	OEmtClearIpLog(): FfiResult;
	OEmtFrontendLog(level: string, event: string, message: string): FfiResult;
	OEmtIntegrationTick(): FfiResult;
	OEmtDiscordTest(): FfiResult;
};
