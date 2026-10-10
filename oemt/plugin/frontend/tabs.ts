// The OEmt.club tab registry. To add a feature, write a view component and add one entry here;
// the shell mounts each page on first visit and keeps it alive (hidden) afterwards. Views can call
// useTabActive() to pause work while hidden.
//
// Ids and legacy redirects (sessions/network -> Network & Sessions, performance -> Diagnostics) are
// defined in routes.ts. New ids that should be selectable as a start tab also go into ui.default_tab
// in backend/core/schema.lua.
import { FC } from 'react';
import type { TabId } from './routes';
import { HomeView } from './views/Home';
import { AccountsView } from './views/Accounts';
import { NetSessionsView } from './views/NetSessions';
import { SettingsView } from './views/Settings';
import { DiagnosticsView } from './views/Diagnostics';
import { LibraryView } from './views/Library';
import { IntegrationsView } from './views/Integrations';

export interface TabDef {
	id: TabId;
	label: string;
	Component: FC;
}

export const TABS: TabDef[] = [
	{ id: 'home', label: 'Home', Component: HomeView },
	{ id: 'accounts', label: 'Accounts', Component: AccountsView },
	{ id: 'netsessions', label: 'Network & Sessions', Component: NetSessionsView },
	{ id: 'settings', label: 'Settings', Component: SettingsView },
	{ id: 'diagnostics', label: 'Diagnostics', Component: DiagnosticsView },
	{ id: 'library', label: 'Library', Component: LibraryView },
	{ id: 'integrations', label: 'Integrations', Component: IntegrationsView },
];

export type { TabId };
