// The OEmt.club tab registry. To add a feature, write a view component and add one entry here;
// the shell mounts each page on first visit and keeps it alive (hidden) afterwards. Views can call
// useTabActive() to pause work while hidden.
//
// Ids and legacy redirects (netsessions/network -> Sessions, performance -> Diagnostics) are
// defined in routes.ts. New ids that should be selectable as a start tab also go into ui.default_tab
// in backend/core/schema.lua.
import { FC } from 'react';
import type { TabId } from './routes';
import { SessionsView } from './views/Sessions';
import { SettingsView } from './views/Settings';
import { DiagnosticsView } from './views/Diagnostics';

export interface TabDef {
	id: TabId;
	label: string;
	Component: FC;
}

export const TABS: TabDef[] = [
	{ id: 'sessions', label: 'Sessions', Component: SessionsView },
	{ id: 'settings', label: 'Settings', Component: SettingsView },
	{ id: 'diagnostics', label: 'Diagnostics', Component: DiagnosticsView },
];

export type { TabId };
