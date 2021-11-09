// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { pki } from 'node-forge';
import * as path from 'path';
import { EOL } from 'os';
import { FileSystem, ITerminal, Import } from '@rushstack/node-core-library';

import { runSudoAsync, IRunResult, runAsync } from './runCommand';
import { CertificateStore } from './CertificateStore';

const forge: typeof import('node-forge') = Import.lazy('node-forge', require);

const SERIAL_NUMBER: string = '731c321744e34650a202e3ef91c3c1b0';
const FRIENDLY_NAME: string = 'debug-certificate-manager Development Certificate';
const MAC_KEYCHAIN: string = '/Library/Keychains/System.keychain';
const CERTUTIL_EXE_NAME: string = 'certutil';

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
   * Get a development certificate from the store, or optionally, generate a new one
   * and trust it if one doesn't exist in the store.
   *
   * @public
   */
  public async ensureCertificateAsync(
    canGenerateNewCertificate: boolean,
    terminal: ITerminal
  ): Promise<ICertificate> {
    if (this._certificateStore.certificateData && this._certificateStore.keyData) {
      let invalidCertificate: boolean = false;
      const messages: string[] = [];

      if (!this._certificateHasSubjectAltName()) {
        invalidCertificate = true;
        messages.push(
          'The existing development certificate is missing the subjectAltName ' +
            'property and will not work with the latest versions of some browsers.'
        );
      }

      if (!(await this._detectIfCertificateIsTrustedAsync(terminal))) {
        invalidCertificate = true;
        messages.push('The existing development certificate is not currently trusted by your system.');
      }

      if (invalidCertificate) {
        if (canGenerateNewCertificate) {
          messages.push('Attempting to untrust the certificate and generate a new one.');
          terminal.writeWarningLine(messages.join(' '));
          await this.untrustCertificateAsync(terminal);
          await this._ensureCertificateInternalAsync(terminal);
        } else {
          messages.push(
            'Untrust the certificate and generate a new one, or set the ' +
              '`canGenerateNewCertificate` parameter to `true` when calling `ensureCertificateAsync`.'
          );
          throw new Error(messages.join(' '));
        }
      }
    } else if (canGenerateNewCertificate) {
      await this._ensureCertificateInternalAsync(terminal);
    } else {
      throw new Error(
        'No development certificate found. Generate a new certificate manually, or set the ' +
          '`canGenerateNewCertificate` parameter to `true` when calling `ensureCertificateAsync`.'
      );
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
  public async untrustCertificateAsync(terminal: ITerminal): Promise<boolean> {
    this._certificateStore.certificateData = undefined;
    this._certificateStore.keyData = undefined;

    switch (process.platform) {
      case 'win32':
        const winUntrustResult: IRunResult = await runAsync(CERTUTIL_EXE_NAME, [
          '-user',
          '-delstore',
          'root',
          SERIAL_NUMBER
        ]);

        if (winUntrustResult.code !== 0) {
          terminal.writeErrorLine(`Error: ${winUntrustResult.stderr.join(' ')}`);
          return false;
        } else {
          terminal.writeVerboseLine('Successfully untrusted development certificate.');
          return true;
        }

      case 'darwin':
        terminal.writeVerboseLine('Trying to find the signature of the development certificate.');

        const macFindCertificateResult: IRunResult = await runAsync('security', [
          'find-certificate',
          '-c',
          'localhost',
          '-a',
          '-Z',
          MAC_KEYCHAIN
        ]);
        if (macFindCertificateResult.code !== 0) {
          terminal.writeErrorLine(
            `Error finding the development certificate: ${macFindCertificateResult.stderr.join(' ')}`
          );
          return false;
        }

        const shaHash: string | undefined = this._parseMacOsMatchingCertificateHash(
          macFindCertificateResult.stdout.join(EOL)
        );

        if (!shaHash) {
          terminal.writeErrorLine('Unable to find the development certificate.');
          return false;
        } else {
          terminal.writeVerboseLine(`Found the development certificate. SHA is ${shaHash}`);
        }

        const macUntrustResult: IRunResult = await runSudoAsync('security', [
          'delete-certificate',
          '-Z',
          shaHash,
          MAC_KEYCHAIN
        ]);

        if (macUntrustResult.code === 0) {
          terminal.writeVerboseLine('Successfully untrusted development certificate.');
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
            `certificate has serial number "${SERIAL_NUMBER}".`
        );
        return false;
    }
  }

  private _createDevelopmentCertificate(): ICertificate {
    const keys: pki.KeyPair = forge.pki.rsa.generateKeyPair(2048);
    const certificate: pki.Certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;

    certificate.serialNumber = SERIAL_NUMBER;

    const now: Date = new Date();
    certificate.validity.notBefore = now;
    // Valid for 3 years
    certificate.validity.notAfter.setFullYear(certificate.validity.notBefore.getFullYear() + 3);

    const attrs: pki.CertificateField[] = [
      {
        name: 'commonName',
        value: 'localhost'
      }
    ];

    certificate.setSubject(attrs);
    certificate.setIssuer(attrs);

    certificate.setExtensions([
      {
        name: 'subjectAltName',
        altNames: [
          {
            type: 2, // DNS
            value: 'localhost'
          }
        ]
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        dataEncipherment: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true
      },
      {
        name: 'friendlyName',
        value: FRIENDLY_NAME
      }
    ]);

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

  private async _tryTrustCertificateAsync(certificatePath: string, terminal: ITerminal): Promise<boolean> {
    switch (process.platform) {
      case 'win32':
        terminal.writeLine(
          'Attempting to trust a development certificate. This self-signed certificate only points to localhost ' +
            'and will be stored in your local user profile to be used by other instances of ' +
            'debug-certificate-manager. If you do not consent to trust this certificate, click "NO" in the dialog.'
        );

        const winTrustResult: IRunResult = await runAsync(CERTUTIL_EXE_NAME, [
          '-user',
          '-addstore',
          'root',
          certificatePath
        ]);

        if (winTrustResult.code !== 0) {
          terminal.writeErrorLine(`Error: ${winTrustResult.stdout.toString()}`);

          const errorLines: string[] = winTrustResult.stdout
            .toString()
            .split(EOL)
            .map((line: string) => line.trim());

          // Not sure if this is always the status code for "cancelled" - should confirm.
          if (
            winTrustResult.code === 2147943623 ||
            errorLines[errorLines.length - 1].indexOf('The operation was canceled by the user.') > 0
          ) {
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
          'Attempting to trust a development certificate. This self-signed certificate only points to localhost ' +
            'and will be stored in your local user profile to be used by other instances of ' +
            'debug-certificate-manager. If you do not consent to trust this certificate, do not enter your ' +
            'root password in the prompt.'
        );

        const result: IRunResult = await runSudoAsync('security', [
          'add-trusted-cert',
          '-d',
          '-r',
          'trustRoot',
          '-k',
          MAC_KEYCHAIN,
          certificatePath
        ]);

        if (result.code === 0) {
          terminal.writeVerboseLine('Successfully trusted development certificate.');
          return true;
        } else {
          if (
            result.stderr.some(
              (value: string) => !!value.match(/The authorization was cancelled by the user\./)
            )
          ) {
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

  private async _detectIfCertificateIsTrustedAsync(terminal: ITerminal): Promise<boolean> {
    switch (process.platform) {
      case 'win32':
        const winVerifyStoreResult: IRunResult = await runAsync(CERTUTIL_EXE_NAME, [
          '-user',
          '-verifystore',
          'root',
          SERIAL_NUMBER
        ]);

        if (winVerifyStoreResult.code !== 0) {
          terminal.writeVerboseLine(
            'The development certificate was not found in the store. CertUtil error: ',
            winVerifyStoreResult.stderr.join(' ')
          );
          return false;
        } else {
          terminal.writeVerboseLine(
            'The development certificate was found in the store. CertUtil output: ',
            winVerifyStoreResult.stdout.join(' ')
          );
          return true;
        }

      case 'darwin':
        terminal.writeVerboseLine('Trying to find the signature of the development certificate.');

        const macFindCertificateResult: IRunResult = await runAsync('security', [
          'find-certificate',
          '-c',
          'localhost',
          '-a',
          '-Z',
          MAC_KEYCHAIN
        ]);

        if (macFindCertificateResult.code !== 0) {
          terminal.writeVerboseLine(
            'The development certificate was not found in keychain. Find certificate error: ',
            macFindCertificateResult.stderr.join(' ')
          );
          return false;
        }

        const shaHash: string | undefined = this._parseMacOsMatchingCertificateHash(
          macFindCertificateResult.stdout.join(EOL)
        );

        if (!shaHash) {
          terminal.writeVerboseLine(
            'The development certificate was not found in keychain. Find certificate output:\n',
            macFindCertificateResult.stdout.join(' ')
          );
          return false;
        }

        terminal.writeVerboseLine(`The development certificate was found in keychain.`);
        return true;

      default:
        // Linux + others: Have the user manually verify the cert is trusted
        terminal.writeVerboseLine(
          'Automatic certificate trust validation is only implemented for debug-certificate-manager on Windows ' +
            'and macOS. Manually verify this development certificate is present in your trusted ' +
            `root certification authorities: "${this._certificateStore.certificatePath}". ` +
            `The certificate has serial number "${SERIAL_NUMBER}".`
        );
        // Always return true on Linux to prevent breaking flow.
        return true;
    }
  }

  private async _trySetFriendlyNameAsync(certificatePath: string, terminal: ITerminal): Promise<boolean> {
    if (process.platform === 'win32') {
      const basePath: string = path.dirname(certificatePath);
      const fileName: string = path.basename(certificatePath, path.extname(certificatePath));
      const friendlyNamePath: string = path.join(basePath, `${fileName}.inf`);

      const friendlyNameFile: string = [
        '[Version]',
        'Signature = "$Windows NT$"',
        '[Properties]',
        `11 = "{text}${FRIENDLY_NAME}"`,
        ''
      ].join(EOL);

      await FileSystem.writeFileAsync(friendlyNamePath, friendlyNameFile);

      const repairStoreResult: IRunResult = await runAsync(CERTUTIL_EXE_NAME, [
        '–repairstore',
        '–user',
        'root',
        SERIAL_NUMBER,
        friendlyNamePath
      ]);

      if (repairStoreResult.code !== 0) {
        terminal.writeErrorLine(`CertUtil Error: ${repairStoreResult.stderr.join('')}`);
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

  private async _ensureCertificateInternalAsync(terminal: ITerminal): Promise<void> {
    const certificateStore: CertificateStore = this._certificateStore;
    const generatedCertificate: ICertificate = this._createDevelopmentCertificate();

    const now: Date = new Date();
    const certificateName: string = now.getTime().toString();
    const tempDirName: string = path.join(__dirname, '..', 'temp');

    const tempCertificatePath: string = path.join(tempDirName, `${certificateName}.pem`);
    const pemFileContents: string | undefined = generatedCertificate.pemCertificate;
    if (pemFileContents) {
      await FileSystem.writeFileAsync(tempCertificatePath, pemFileContents, {
        ensureFolderExists: true
      });
    }

    const trustCertificateResult: boolean = await this._tryTrustCertificateAsync(
      tempCertificatePath,
      terminal
    );
    if (trustCertificateResult) {
      certificateStore.certificateData = generatedCertificate.pemCertificate;
      certificateStore.keyData = generatedCertificate.pemKey;

      // Try to set the friendly name, and warn if we can't
      if (!this._trySetFriendlyNameAsync(tempCertificatePath, terminal)) {
        terminal.writeWarningLine("Unable to set the certificate's friendly name.");
      }
    } else {
      // Clear out the existing store data, if any exists
      certificateStore.certificateData = undefined;
      certificateStore.keyData = undefined;
    }

    await FileSystem.deleteFileAsync(tempCertificatePath);
  }

  private _certificateHasSubjectAltName(): boolean {
    const certificateData: string | undefined = this._certificateStore.certificateData;
    if (!certificateData) {
      return false;
    }
    const certificate: pki.Certificate = forge.pki.certificateFromPem(certificateData);
    return !!certificate.getExtension('subjectAltName');
  }

  private _parseMacOsMatchingCertificateHash(findCertificateOuput: string): string | undefined {
    let shaHash: string | undefined = undefined;
    for (const line of findCertificateOuput.split(EOL)) {
      // Sets `shaHash` to the current certificate SHA-1 as we progress through the lines of certificate text.
      const shaHashMatch: string[] | null = line.match(/^SHA-1 hash: (.+)$/);
      if (shaHashMatch) {
        shaHash = shaHashMatch[1];
      }

      const snbrMatch: string[] | null = line.match(/^\s*"snbr"<blob>=0x([^\s]+).+$/);
      if (snbrMatch && (snbrMatch[1] || '').toLowerCase() === SERIAL_NUMBER) {
        return shaHash;
      }
    }
  }
}
