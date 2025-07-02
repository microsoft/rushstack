// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { getConfig } from './config';
import { CertificateManager } from '@rushstack/debug-certificate-manager';

export function getCertificateManager(
  outputChannel: vscode.OutputChannel,
  configType: 'ui' | 'workspace'
): CertificateManager {
  const { caCertificateFilename, keyFilename, certificateFilename, storePath } = getConfig(
    outputChannel,
    configType
  );
  const certificateManager: CertificateManager = new CertificateManager({
    caCertificateFilename,
    keyFilename,
    certificateFilename,
    storePath
  });

  return certificateManager;
}
