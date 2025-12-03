// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { ITerminal } from '@rushstack/terminal';
import type { ICertificateStoreOptions } from '@rushstack/debug-certificate-manager';
import {
  CONFIG_AUTOSYNC,
  CONFIG_SECTION,
  CONFIG_CA_CERTIFICATE_FILENAME,
  CONFIG_CERTIFICATE_FILENAME,
  CONFIG_KEY_FILENAME,
  CONFIG_STORE_PATH
} from './constants';

type StorePaths = Record<'windows' | 'linux' | 'osx', string>;
export interface IExtensionConfig extends ICertificateStoreOptions {
  autoSync: boolean;
}

export function getConfig(terminal: ITerminal): IExtensionConfig {
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const caCertificateFilename: string | undefined =
    config.get(CONFIG_CA_CERTIFICATE_FILENAME) || 'rushstack-ca.pem';
  const certificateFilename: string | undefined =
    config.get(CONFIG_CERTIFICATE_FILENAME) || 'rushstack-serve.pem';
  const keyFilename: string | undefined = config.get(CONFIG_KEY_FILENAME) || 'rushstack-serve.key';
  const autoSync: boolean = config.get(CONFIG_AUTOSYNC) ?? false;
  let storePath: string | undefined = undefined;

  const platformMap: Record<string, keyof StorePaths> = {
    win32: 'windows',
    linux: 'linux',
    darwin: 'osx'
  };

  const platformKey: keyof StorePaths = platformMap[process.platform];

  if (platformKey) {
    storePath = config.get(`${CONFIG_STORE_PATH}.${platformKey}`) || '~/.rushstack';
    if (storePath) {
      const homeDir: string | undefined = process.env.HOME || process.env.USERPROFILE;
      if (storePath[0] === '~' && homeDir) {
        storePath = path.join(homeDir, storePath.slice(1));
      }
    }
  } else {
    terminal.writeLine(`Unsupported platform: ${process.platform}`);
  }

  const extensionConfig: IExtensionConfig = {
    storePath,
    caCertificateFilename,
    certificateFilename,
    keyFilename,
    autoSync
  };
  terminal.writeLine(`Extension config: ${JSON.stringify(extensionConfig)}`);
  return extensionConfig;
}
