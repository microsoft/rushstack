// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const WORKSPACE_EXTENSION_DISPLAY_NAME: string = 'TLS Sync (Workspace Extension)';
export const UI_EXTENSION_DISPLAY_NAME: string = 'TLS Sync (UI Extension)';

export const WORKSPACE_EXTENSION_ID: string = 'RushStack.tls-sync-vscode-workspace-extension';
export const UI_EXTENSION_ID: string = 'RushStack.tls-sync-vscode-ui-extension';

export const WORKSPACE_COMMAND_PREFIX: string = 'tlssync.workspace';
export const UI_COMMAND_PREFIX: string = 'tlssync.ui';

export const WORKSPACE_COMMAND_SYNC: string = `${WORKSPACE_COMMAND_PREFIX}.sync`;
export const WORKSPACE_COMMAND_SHOW_LOG: string = `${WORKSPACE_COMMAND_PREFIX}.showLog`;
export const WORKSPACE_COMMAND_PING: string = `${WORKSPACE_COMMAND_PREFIX}.ping`;

export const UI_COMMAND_SYNC: string = `${UI_COMMAND_PREFIX}.sync`;
export const UI_COMMAND_ENSURE_CERTIFICATE: string = `${UI_COMMAND_PREFIX}.ensureCertificate`;
export const UI_COMMAND_UNTRUST_CERTIFICATE: string = `${UI_COMMAND_PREFIX}.untrustCertificate`;
export const UI_COMMAND_SHOW_LOG: string = `${UI_COMMAND_PREFIX}.showLog`;
export const UI_COMMAND_SHOW_WALKTHROUGH: string = `${UI_COMMAND_PREFIX}.showWalkthrough`;
export const UI_COMMAND_SHOW_SETTINGS: string = `${UI_COMMAND_PREFIX}.showSettings`;

export const CONFIG_SECTION: string = 'tlssync';
export const CONFIG_AUTOSYNC: string = 'autoSync';
export const CONFIG_CA_CERTIFICATE_FILENAME: string = 'caCertificateFilename';
export const CONFIG_CERTIFICATE_FILENAME: string = 'certificateFilename';
export const CONFIG_KEY_FILENAME: string = 'keyFilename';
export const CONFIG_STORE_PATH: string = 'storePath';

export const VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS: string = 'workbench.action.openSettings';
export const VSCODE_COMMAND_WORKSPACE_OPEN_WALKTHROUGH: string = 'workbench.action.openWalkthrough';

export const UI_WALKTHROUGH_ID: string = 'sync-certificates';
