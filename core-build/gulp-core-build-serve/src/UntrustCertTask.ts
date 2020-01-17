// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  GulpTask,
  GCBTerminalProvider
} from '@microsoft/gulp-core-build';
import { Terminal } from '@microsoft/node-core-library';
import * as Gulp from 'gulp';
import {
  CertificateStore,
  untrustCertificate
} from '@rushstack/debug-certificate-manager';

/**
 * On Windows, this task removes the certificate with the expected serial number from the user's
 *  root certification authorities list. On macOS, it finds the SHA signature of the certificate
 *  with the expected serial number and then removes that certificate from the keychain. On
 *  other platforms, the user must untrust the certificate manually. On all platforms,
 *  the certificate and private key are deleted from the user's home directory.
 */
export class UntrustCertTask extends GulpTask<void> {
  private _terminalProvider: GCBTerminalProvider;
  private _terminal: Terminal;

  public constructor() {
    super('untrust-cert');

    this._terminalProvider = new GCBTerminalProvider(this);
    this._terminal = new Terminal(this._terminalProvider);
  }

  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): void {
    const untrustCertResult: boolean = untrustCertificate(this._terminal);
    const certificateStore: CertificateStore = new CertificateStore();

    // Clear out the certificate store
    certificateStore.certificateData = undefined;
    certificateStore.keyData = undefined;

    if (untrustCertResult) {
      completeCallback();
    } else {
      completeCallback('Error untrusting certificate.');
    }
  }
}
