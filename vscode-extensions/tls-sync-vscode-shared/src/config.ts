// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';

import type { ICertificateManagerOptions } from '@rushstack/debug-certificate-manager';
import { SETTINGS_PREFIX } from './constants';

export interface IExtensionConfig extends ICertificateManagerOptions {
  autoSync: boolean;
}

export function getConfig(outputChannel: vscode.OutputChannel): IExtensionConfig {
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(SETTINGS_PREFIX);
  const storePath: string | undefined = config.get('storePath') || undefined;
  const caCertificateFilename: string | undefined = config.get('caCertificateFilename') || undefined;
  const certificateFilename: string | undefined = config.get('certificateFilename') || undefined;
  const keyFilename: string | undefined = config.get('keyFilename') || undefined;
  const autoSync: boolean = config.get('autoSync') ?? false;

  outputChannel.appendLine(`config.storePath: ${storePath}`);
  outputChannel.appendLine(`config.caCertificateFilename: ${caCertificateFilename}`);
  outputChannel.appendLine(`config.certificateFilename: ${certificateFilename}`);
  outputChannel.appendLine(`config.keyFilename: ${keyFilename}`);
  outputChannel.appendLine(`config.autoSync: ${autoSync}`);

  return {
    storePath,
    caCertificateFilename,
    certificateFilename,
    keyFilename,
    autoSync
  };
}
