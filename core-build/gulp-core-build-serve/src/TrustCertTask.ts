// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask, GCBTerminalProvider } from '@microsoft/gulp-core-build';
import { ICertificate, CertificateManager } from '@rushstack/debug-certificate-manager';
import { Terminal } from '@rushstack/node-core-library';

/**
 * This task generates and trusts a development certificate. The certificate is self-signed
 *  and stored, along with its private key, in the user's home directory. On Windows, it's
 *  trusted as a root certification authority in the user certificate store. On macOS, it's
 *  trusted as a root cert in the keychain. On other platforms, the certificate is generated
 *  and signed, but the user must trust it manually.
 */
export class TrustCertTask extends GulpTask<void> {
  private _terminalProvider: GCBTerminalProvider;
  private _terminal: Terminal;

  public constructor() {
    super('trust-cert');
    this._terminalProvider = new GCBTerminalProvider(this);
    this._terminal = new Terminal(this._terminalProvider);
  }

  public async executeTask(): Promise<void> {
    const certificateManager: CertificateManager = new CertificateManager();
    const certificate: ICertificate = await certificateManager.ensureCertificateAsync(true, this._terminal);

    if (!certificate.pemCertificate || !certificate.pemKey) {
      throw new Error('Error trusting development certificate.');
    }
  }
}
