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
export const WORKSPACE_COMMAND_SHOW_WALKTHROUGH: string = `${WORKSPACE_COMMAND_PREFIX}.showWalkthrough`;
export const WORKSPACE_COMMAND_SHOW_SETTINGS: string = `${WORKSPACE_COMMAND_PREFIX}.showSettings`;

export const UI_COMMAND_ENSURE_CERTIFICATE: string = `${UI_COMMAND_PREFIX}.ensureCertificate`;
export const UI_COMMAND_UNTRUST_CERTIFICATE: string = `${UI_COMMAND_PREFIX}.untrustCertificate`;
export const UI_COMMAND_SHOW_LOG: string = `${UI_COMMAND_PREFIX}.showLog`;
export const UI_COMMAND_PING: string = `${UI_COMMAND_PREFIX}.ping`;

export const SETTINGS_PREFIX: string = 'tlssync';
