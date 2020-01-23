// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as forge from 'node-forge';
import * as path from 'path';
import * as child_process from 'child_process';
import { EOL } from 'os';
import { FileSystem, Terminal } from '@microsoft/node-core-library';

import { runSudoSync, ISudoSyncResult } from './sudoSync';
import { CertificateStore } from './CertificateStore';

const serialNumber: string = '731c321744e34650a202e3ef91c3c1b0';
const friendlyName: string = 'debug-certificate-manager Development Certificate';
const macKeychain: string = '/Library/Keychains/System.keychain';

let _certutilExePath: string | undefined;

/**
 * The interface for a debug certificate instance
 *
 * @public
 */
export interface ICertificate {
  /**
   * Generated pem certificate contents
   */
  pemCertificate: string | undefined;

  /**
   * Private key used to sign the pem certificate
   */
  pemKey: string | undefined;
}

/**
 * A utility class to handle generating, trusting, and untrustring a debug certificate.
 * Contains two public methods to `ensureCertificate` and `untrustCertificate`.
 * @public
 */
export class CertificateManager {
  private _certificateStore: CertificateStore;

  public constructor() {
    this._certificateStore = new CertificateStore();
  }

  /**
   * Get a dev certificate from the store, or optionally, generate a new one
   * and trust it if one doesn't exist in the store.
   *
   * @public
   */
  public ensureCertificate(
    canGenerateNewCertificate: boolean,
    terminal: Terminal
  ): ICertificate {

    if (this._certificateStore.certificateData && this._certificateStore.keyData) {
      if (!this._certificateHasSubjectAltName()) {
        let warningMessage: string = (
          'The existing development certificate is missing the subjectAltName ' +
          'property and will not work with the latest versions of some browsers. '
        );

        if (canGenerateNewCertificate) {
          warningMessage += ' Attempting to untrust the certificate and generate a new one.';
        } else {
          warningMessage += ' Untrust the certificate and generate a new one.';
        }

        terminal.writeWarningLine(warningMessage);

        if (canGenerateNewCertificate) {
          this.untrustCertificate(terminal);
          this._ensureCertificateInternal(terminal);
        }
      }
    } else if (canGenerateNewCertificate) {
      this._ensureCertificateInternal(terminal);
    }

    return {
      pemCertificate: this._certificateStore.certificateData,
      pemKey: this._certificateStore.keyData
    };
  }

  /**
   * Attempt to locate a previously generated debug certificate and untrust it.
   *
   * @public
   */
  public untrustCertificate(terminal: Terminal): boolean {
    switch (process.platform) {
      case 'win32':
        const certutilExePath: string | undefined = this._ensureCertUtilExePath(terminal);
        if (!certutilExePath) {
          // Unable to find the cert utility
          return false;
        }

        const winUntrustResult: child_process.SpawnSyncReturns<string> =
          child_process.spawnSync(certutilExePath, ['-user', '-delstore', 'root', serialNumber]);

        if (winUntrustResult.status !== 0) {
          terminal.writeErrorLine(`Error: ${winUntrustResult.stdout.toString()}`);
          return false;
        } else {
          terminal.writeVerboseLine('Successfully untrusted development certificate.');
          return true;
        }

      case 'darwin':
        terminal.writeVerboseLine('Trying to find the signature of the dev cert');

        const macFindCertificateResult: child_process.SpawnSyncReturns<string> =
          child_process.spawnSync('security', ['find-certificate', '-c', 'localhost', '-a', '-Z', macKeychain]);
        if (macFindCertificateResult.status !== 0) {
          terminal.writeErrorLine(`Error finding the dev certificate: ${macFindCertificateResult.output.join(' ')}`);
          return false;
        }

        const outputLines: string[] = macFindCertificateResult.stdout.toString().split(EOL);
        let found: boolean = false;
        let shaHash: string = "";
        for (let i: number = 0; i < outputLines.length; i++) {
          const line: string = outputLines[i];
          const shaMatch: string[] | null = line.match(/^SHA-1 hash: (.+)$/);
          if (shaMatch) {
            shaHash = shaMatch[1];
          }

          const snbrMatch: string[] | null = line.match(/^\s*"snbr"<blob>=0x([^\s]+).+$/);
          if (snbrMatch && (snbrMatch[1] || '').toLowerCase() === serialNumber) {
            found = true;
            break;
          }
        }

        if (!found) {
          terminal.writeErrorLine('Unable to find the dev certificate.');
          return false;
        }

        terminal.writeVerboseLine(`Found the dev cert. SHA is ${shaHash}`);

        const macUntrustResult: ISudoSyncResult =
          runSudoSync(['security', 'delete-certificate', '-Z', shaHash, macKeychain]);

        if (macUntrustResult.code === 0) {
          terminal.writeVerboseLine('Successfully untrusted dev certificate.');
          return true;
        } else {
          terminal.writeErrorLine(macUntrustResult.stderr.join(' '));
          return false;
        }

      default:
        // Linux + others: Have the user manually untrust the cert
        terminal.writeLine(
          'Automatic certificate untrust is only implemented for debug-certificate-manager on Windows ' +
          'and macOS. To untrust the development certificate, remove this certificate from your trusted ' +
          `root certification authorities: "${this._certificateStore.certificatePath}". The ` +
          `certificate has serial number "${serialNumber}".`
        );
        return false;
    }
  }


  private _createDevelopmentCertificate(): ICertificate {
    const keys: forge.pki.KeyPair = forge.pki.rsa.generateKeyPair(2048);
    const certificate: forge.pki.Certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;

    certificate.serialNumber = serialNumber;

    const now: Date = new Date();
    certificate.validity.notBefore = now;
    // Valid for 3 years
    certificate.validity.notAfter.setFullYear(certificate.validity.notBefore.getFullYear() + 3);

    const attrs: forge.pki.CertificateField[] = [{
      name: 'commonName',
      value: 'localhost'
    }];

    certificate.setSubject(attrs);
    certificate.setIssuer(attrs);

    certificate.setExtensions([
      {
        name: 'subjectAltName',
        altNames: [{
          type: 2, // DNS
          value: 'localhost'
        }]
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        dataEncipherment: true
      }, {
        name: 'extKeyUsage',
        serverAuth: true
      }, {
        name: 'friendlyName',
        value: friendlyName
      }]);

    // self-sign certificate
    certificate.sign(keys.privateKey, forge.md.sha256.create());

    // convert a Forge certificate to PEM
    const pem: string = forge.pki.certificateToPem(certificate);
    const pemKey: string = forge.pki.privateKeyToPem(keys.privateKey);

    return {
      pemCertificate: pem,
      pemKey: pemKey
    };
  }

  private _ensureCertUtilExePath(terminal: Terminal): string | undefined {
    if (!_certutilExePath) {
      const where: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
        'where',
        ['certutil']
      );

      const whereErr: string = where.stderr.toString();
      if (whereErr) {
        terminal.writeErrorLine(`Error finding certUtil command: "${whereErr}"`);
        _certutilExePath = undefined;
      } else {
        const lines: string[] = where.stdout.toString().trim().split(EOL);
        _certutilExePath = lines[0].trim();
      }
    }

    return _certutilExePath;
  }

  private _tryTrustCertificate(certificatePath: string, terminal: Terminal): boolean {
    switch (process.platform) {
      case 'win32':
        const certutilExePath: string | undefined = this._ensureCertUtilExePath(terminal);
        if (!certutilExePath) {
          // Unable to find the cert utility
          return false;
        }

        terminal.writeLine(
          'Attempting to trust a dev certificate. This self-signed certificate only points to localhost ' +
          'and will be stored in your local user profile to be used by other instances of ' +
          'debug-certificate-manager. If you do not consent to trust this certificate, click "NO" in the dialog.'
        );

        const winTrustResult: child_process.SpawnSyncReturns<string> =
          child_process.spawnSync(certutilExePath, ['-user', '-addstore', 'root', certificatePath]);

        if (winTrustResult.status !== 0) {
          terminal.writeErrorLine(`Error: ${winTrustResult.stdout.toString()}`);

          const errorLines: string[] = winTrustResult.stdout.toString().split(EOL).map(
            (line: string) => line.trim()
          );

          // Not sure if this is always the status code for "cancelled" - should confirm.
          if (winTrustResult.status === 2147943623 ||
              errorLines[errorLines.length - 1].indexOf('The operation was canceled by the user.') > 0) {
            terminal.writeLine('Certificate trust cancelled.');
          } else {
            terminal.writeErrorLine('Certificate trust failed with an unknown error.');
          }

          return false;
        } else {
          terminal.writeVerboseLine('Successfully trusted development certificate.');

          return true;
        }

      case 'darwin':
        terminal.writeLine(
          'Attempting to trust a dev certificate. This self-signed certificate only points to localhost ' +
          'and will be stored in your local user profile to be used by other instances of ' +
          'debug-certificate-manager. If you do not consent to trust this certificate, do not enter your ' +
          'root password in the prompt.'
        );

        const commands: string[] = [
          'security',
          'add-trusted-cert',
          '-d',
          '-r',
          'trustRoot',
          '-k',
          macKeychain,
          certificatePath
        ];
        const result: ISudoSyncResult = runSudoSync(commands);

        if (result.code === 0) {
          terminal.writeVerboseLine('Successfully trusted development certificate.');
          return true;
        } else {
          if (result.stderr.some((value: string) => !!value.match(/The authorization was cancelled by the user\./))) {
            terminal.writeLine('Certificate trust cancelled.');
            return false;
          } else {
            terminal.writeErrorLine(
              `Certificate trust failed with an unknown error. Exit code: ${result.code}. ` +
              `Error: ${result.stderr.join(' ')}`
            );
            return false;
          }
        }

      default:
        // Linux + others: Have the user manually trust the cert if they want to
        terminal.writeLine(
          'Automatic certificate trust is only implemented for debug-certificate-manager on Windows ' +
          'and macOS. To trust the development certificate, add this certificate to your trusted root ' +
          `certification authorities: "${certificatePath}".`
        );
        return true;
    }
  }

  private _trySetFriendlyName(certificatePath: string, terminal: Terminal): boolean {
    if (process.platform === 'win32') {
      const certutilExePath: string | undefined = this._ensureCertUtilExePath(terminal);
      if (!certutilExePath) {
        // Unable to find the cert utility
        return false;
      }

      const basePath: string = path.dirname(certificatePath);
      const fileName: string = path.basename(certificatePath, path.extname(certificatePath));
      const friendlyNamePath: string = path.join(basePath, `${fileName}.inf`);

      const friendlyNameFile: string = [
        '[Version]',
        'Signature = "$Windows NT$"',
        '[Properties]',
        `11 = "{text}${friendlyName}"`,
        ''
      ].join(EOL);

      FileSystem.writeFile(friendlyNamePath, friendlyNameFile);

      const commands: string[] = [
        '–repairstore',
        '–user',
        'root',
        serialNumber,
        friendlyNamePath
      ];
      const repairStoreResult: child_process.SpawnSyncReturns<string> =
        child_process.spawnSync(certutilExePath, commands);

      if (repairStoreResult.status !== 0) {
        terminal.writeErrorLine(`CertUtil Error: ${repairStoreResult.stdout.toString()}`);

        return false;
      } else {
        terminal.writeVerboseLine('Successfully set certificate name.');

        return true;
      }
    } else {
      // No equivalent concept outside of Windows
      return true;
    }
  }

  private _ensureCertificateInternal(terminal: Terminal): void {
    const certificateStore: CertificateStore = this._certificateStore;
    const generatedCertificate: ICertificate = this._createDevelopmentCertificate();

    const now: Date = new Date();
    const certificateName: string = now.getTime().toString();
    const tempDirName: string = path.join(__dirname, '..', 'temp');

    const tempCertificatePath: string = path.join(tempDirName, `${certificateName}.pem`);
    const pemFileContents: string | undefined = generatedCertificate.pemCertificate;
    if (pemFileContents) {
      FileSystem.writeFile(tempCertificatePath, pemFileContents, {
        ensureFolderExists: true
      });
    }

    if (this._tryTrustCertificate(tempCertificatePath, terminal)) {
      certificateStore.certificateData = generatedCertificate.pemCertificate;
      certificateStore.keyData = generatedCertificate.pemKey;

      // Try to set the friendly name, and warn if we can't
      if (!this._trySetFriendlyName(tempCertificatePath, terminal)) {
        terminal.writeWarningLine('Unable to set the certificate\'s friendly name.');
      }
    } else {
      // Clear out the existing store data, if any exists
      certificateStore.certificateData = undefined;
      certificateStore.keyData = undefined;
    }

    FileSystem.deleteFile(tempCertificatePath);
  }

  private _certificateHasSubjectAltName(): boolean {
    const certificateData: string | undefined = this._certificateStore.certificateData;
    if (!certificateData) {
      return false;
    }
    const certificate: forge.pki.Certificate = forge.pki.certificateFromPem(certificateData);
    return !!certificate.getExtension('subjectAltName');
  }


}