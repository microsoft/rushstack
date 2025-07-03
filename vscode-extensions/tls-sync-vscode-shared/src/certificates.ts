// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getConfig } from './config';
import { CertificateManager, CertificateStore } from '@rushstack/debug-certificate-manager';
import type { ITerminal } from '@rushstack/terminal';

export function getCertificateManager(
  terminal: ITerminal,
  configType: 'ui' | 'workspace'
): CertificateManager {
  const { caCertificateFilename, keyFilename, certificateFilename, storePath } = getConfig(
    terminal,
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

export function getCertificateStore(terminal: ITerminal, configType: 'ui' | 'workspace'): CertificateStore {
  const { caCertificateFilename, keyFilename, certificateFilename, storePath } = getConfig(
    terminal,
    configType
  );
  const certificateStore: CertificateStore = new CertificateStore({
    caCertificateFilename,
    keyFilename,
    certificateFilename,
    storePath
  });

  return certificateStore;
}
