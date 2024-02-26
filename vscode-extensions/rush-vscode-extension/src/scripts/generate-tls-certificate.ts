// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRunScriptOptions } from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';
import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { homedir } from 'node:os';
import * as path from 'path';

export async function runAsync({ heftTaskSession: { logger } }: IRunScriptOptions): Promise<void> {
  const certificateManager: CertificateManager = new CertificateManager();

  // logger.terminal.writeLine(`Untrusting existing CA certificate`);
  // await certificateManager.untrustCertificateAsync(logger.terminal);

  logger.terminal.writeLine(
    `Obtaining a TLS certificate signed by a local self-signed Certificate Authority`
  );

  const {
    pemCaCertificate,
    pemCertificate,
    pemKey
  }: ICertificate & {
    pemCaCertificate?: string;
  } = await certificateManager.ensureCertificateAsync(true, logger.terminal);

  if (!pemCertificate || !pemKey) {
    throw new Error(`No certificate available, exiting.`);
  }

  logger.terminal.writeLine(`Trusted TLS certificate successfully obtained`);

  const unresolvedUserFolder: string = homedir();
  const userProfilePath: string = path.resolve(unresolvedUserFolder);
  if (!FileSystem.exists(userProfilePath)) {
    throw new Error("Unable to determine the current user's home directory");
  }

  const serveDataPath: string = path.join(userProfilePath, '.rushstack');
  FileSystem.ensureFolder(serveDataPath);

  const caCertificatePath: string = path.join(serveDataPath, 'rushstack-ca.pem');
  const certificatePath: string = path.join(serveDataPath, 'rushstack-serve.pem');
  const keyPath: string = path.join(serveDataPath, 'rushstack-serve.key');

  if (pemCaCertificate) {
    await FileSystem.writeFileAsync(caCertificatePath, pemCaCertificate);
  }

  await FileSystem.writeFileAsync(certificatePath, pemCertificate);
  await FileSystem.writeFileAsync(keyPath, pemKey);
}
