// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import packageJson from '../package.json';

export const EXTENSION_DISPLAY_NAME: string = 'Debug Certificate Manager';

export const EXTENSION_ID: string = `${packageJson.publisher}.${packageJson.name}`;
export const VSCODE_SETTINGS_EXTENSION_ID_FILTER: string = `@ext:${EXTENSION_ID}`;

export const COMMAND_PREFIX: string = 'debugCertificateManager';
export const COMMAND_SYNC: string = `${COMMAND_PREFIX}.sync`;
export const COMMAND_ENSURE_CERTIFICATE: string = `${COMMAND_PREFIX}.ensureCertificate`;
export const COMMAND_UNTRUST_CERTIFICATE: string = `${COMMAND_PREFIX}.untrustCertificate`;
export const COMMAND_SHOW_LOG: string = `${COMMAND_PREFIX}.showLog`;
export const COMMAND_SHOW_SETTINGS: string = `${COMMAND_PREFIX}.showSettings`;

export const CONFIG_SECTION: string = 'debugCertificateManager';
export const CONFIG_AUTOSYNC: string = 'autoSync';
export const CONFIG_CA_CERTIFICATE_FILENAME: string = 'caCertificateFilename';
export const CONFIG_CERTIFICATE_FILENAME: string = 'certificateFilename';
export const CONFIG_KEY_FILENAME: string = 'keyFilename';
export const CONFIG_STORE_PATH: string = 'storePath';

export const VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS: string = 'workbench.action.openSettings';
