// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getConfig } from './config';
import { CertificateManager, CertificateStore } from '@rushstack/debug-certificate-manager';
import type { ITerminal } from '@rushstack/terminal';

export function getCertificateManager(terminal: ITerminal): CertificateManager {
  const { caCertificateFilename, keyFilename, certificateFilename, storePath } = getConfig(terminal);
  const certificateManager: CertificateManager = new CertificateManager({
    caCertificateFilename,
    keyFilename,
    certificateFilename,
    storePath
  });

  return certificateManager;
}

export function getCertificateStore(terminal: ITerminal): CertificateStore {
  const { caCertificateFilename, keyFilename, certificateFilename, storePath } = getConfig(terminal);
  const certificateStore: CertificateStore = new CertificateStore({
    caCertificateFilename,
    keyFilename,
    certificateFilename,
    storePath
  });

  return certificateStore;
}
