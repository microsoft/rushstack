// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference path="./NodeForgeExtensions.d.ts" />

import { GulpTask } from '@microsoft/gulp-core-build';
import { FileSystem } from '@microsoft/node-core-library';
import * as forgeType from 'node-forge';
// eslint-disable-next-line
const forge: typeof forgeType & IForgeExtensions = require('node-forge');
import * as path from 'path';
import * as child_process from 'child_process';
import { EOL } from 'os';

import { runSudoSync, ISudoSyncResult } from './sudoSync';
import { CertificateStore } from './CertificateStore';

const serialNumber: string = '731c321744e34650a202e3ef91c3c1b9';
const friendlyName: string = 'gulp-core-build-serve Development Certificate';
const macKeychain: string = '/Library/Keychains/System.keychain';

let _certutilExePath: string;

export interface ICertificate {
  pemCertificate: string;
  pemKey: string;
}

function _createDevelopmentCertificate(): ICertificate {
  const keys: forgeType.pki.KeyPair = forge.pki.rsa.generateKeyPair(2048);
  const certificate: IForgeCertificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;

  certificate.serialNumber = serialNumber;

  const now: Date = new Date();
  certificate.validity.notBefore = now;
  certificate.validity.notAfter.setFullYear(certificate.validity.notBefore.getFullYear() + 3); // Three years from now

  const attrs: IAttr[] = [{
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
  const privateKey: string = forge.pki.privateKeyToPem(keys.privateKey);

  return {
    pemCertificate: pem,
    pemKey: privateKey
  };
}

function _ensureCertUtilExePath(parentTask: GulpTask<{}>): string {
  if (!_certutilExePath) {
    const where: child_process.SpawnSyncReturns<string> = child_process.spawnSync('where', ['certutil']);

    const whereErr: string = where.stderr.toString();
    if (whereErr) {
      parentTask.logError(`Error finding certUtil command: "${whereErr}"`);
      _certutilExePath = undefined;
    } else {
      const lines: string[] = where.stdout.toString().trim().split(EOL);
      _certutilExePath = lines[0].trim();
    }
  }

  return _certutilExePath;
}

function _tryTrustCertificate(certificatePath: string, parentTask: GulpTask<{}>): boolean {
  switch (process.platform) {
    case 'win32':
      const certutilExePath: string = _ensureCertUtilExePath(parentTask);
      if (!certutilExePath) {
        // Unable to find the cert utility
        return false;
      }

      parentTask.log( 'Attempting to trust a dev certificate. This self-signed certificate only points to localhost ' +
                      'and will be stored in your local user profile to be used by other instances of ' +
                      'gulp-core-build-serve. If you do not consent to trust this certificate, click "NO" in the ' +
                      'dialog.');

      const winTrustResult: child_process.SpawnSyncReturns<string> =
        child_process.spawnSync(certutilExePath, ['-user', '-addstore', 'root', certificatePath]);

      if (winTrustResult.status !== 0) {
        parentTask.logError(`Error: ${winTrustResult.stdout.toString()}`);

        const errorLines: string[] = winTrustResult.stdout.toString().split(EOL).map((line: string) => line.trim());

        // Not sure if this is always the status code for "cancelled" - should confirm.
        if (winTrustResult.status === 2147943623 ||
            errorLines[errorLines.length - 1].indexOf('The operation was canceled by the user.') > 0) {
          parentTask.log('Certificate trust cancelled.');
        } else {
          parentTask.logError('Certificate trust failed with an unknown error.');
        }

        return false;
      } else {
        parentTask.logVerbose('Successfully trusted development certificate.');

        return true;
      }

    case 'darwin':
      parentTask.log( 'Attempting to trust a dev certificate. This self-signed certificate only points to localhost ' +
                      'and will be stored in your local user profile to be used by other instances of ' +
                      'gulp-core-build-serve. If you do not consent to trust this certificate, do not enter your ' +
                      'root password in the prompt.');

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
        parentTask.logVerbose('Successfully trusted development certificate.');
        return true;
      } else {
        if (result.stderr.some((value: string) => !!value.match(/The authorization was cancelled by the user\./))) {
          parentTask.log('Certificate trust cancelled.');
          return false;
        } else {
          parentTask.logError(`Certificate trust failed with an unknown error. Exit code: ${result.code}. ` +
                              `Error: ${result.stderr.join(' ')}`);
          return false;
        }
      }

    default:
      // Linux + others: Have the user manually trust the cert if they want to
      parentTask.log( 'Automatic certificate trust is only implemented for gulp-core-build-serve on Windows and ' +
                      'macOS. To trust the development certificate, add this certificate to your trusted root ' +
                      `certification authorities: "${CertificateStore.instance.certificatePath}".`);
      return true;
  }
}

function _trySetFriendlyName(certificatePath: string, parentTask: GulpTask<{}>): boolean {
  if (process.platform === 'win32') {
    const certutilExePath: string = _ensureCertUtilExePath(parentTask);
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
      parentTask.logError(`CertUtil Error: ${repairStoreResult.stdout.toString()}`);

      return false;
    } else {
      parentTask.logVerbose('Successfully set certificate name.');

      return true;
    }
  } else {
    // No equivalent concept outside of Windows
    return true;
  }
}

function _ensureCertificateInternal(parentTask: GulpTask<{}>): void {
  const certificateStore: CertificateStore = CertificateStore.instance;
  const generatedCertificate: ICertificate = _createDevelopmentCertificate();

  const now: Date = new Date();
  const certificateName: string = now.getTime().toString();
  const tempDirName: string = path.join(__dirname, '..', 'temp');

  const tempCertificatePath: string = path.join(tempDirName, `${certificateName}.cer`);
  FileSystem.writeFile(tempCertificatePath, generatedCertificate.pemCertificate, {
    ensureFolderExists: true
  });

  if (_tryTrustCertificate(tempCertificatePath, parentTask)) {
    certificateStore.certificateData = generatedCertificate.pemCertificate;
    certificateStore.keyData = generatedCertificate.pemKey;

    if (!_trySetFriendlyName(tempCertificatePath, parentTask)) { // Try to set the friendly name, and warn if we can't
      parentTask.logWarning('Unable to set the certificate\'s friendly name.');
    }
  } else {
    // Clear out the existing store data, if any exists
    certificateStore.certificateData = undefined;
    certificateStore.keyData = undefined;
  }

  FileSystem.deleteFile(tempCertificatePath);
}

function _certificateHasSubjectAltName(certificateData: string): boolean {
  const certificate: IForgeCertificate = forge.pki.certificateFromPem(certificateData);
  return !!certificate.getExtension('subjectAltName');
}

export function untrustCertificate<TGulpTask>(parentTask: GulpTask<TGulpTask>): boolean {
  switch (process.platform) {
    case 'win32':
      const certutilExePath: string = _ensureCertUtilExePath(parentTask);
      if (!certutilExePath) {
        // Unable to find the cert utility
        return false;
      }

      const winUntrustResult: child_process.SpawnSyncReturns<string> =
        child_process.spawnSync(certutilExePath, ['-user', '-delstore', 'root', serialNumber]);

      if (winUntrustResult.status !== 0) {
        parentTask.logError(`Error: ${winUntrustResult.stdout.toString()}`);
        return false;
      } else {
        parentTask.logVerbose('Successfully untrusted development certificate.');
        return true;
      }

    case 'darwin':
      parentTask.logVerbose('Trying to find the signature of the dev cert');

      const macFindCertificateResult: child_process.SpawnSyncReturns<string> =
        child_process.spawnSync('security', ['find-certificate', '-c', 'localhost', '-a', '-Z', macKeychain]);

      if (macFindCertificateResult.status !== 0) {
        parentTask.logError(`Error finding the dev certificate: ${macFindCertificateResult.output.join(' ')}`);
        return false;
      }

      const outputLines: string[] = macFindCertificateResult.stdout.toString().split(EOL);
      let found: boolean = false;
      let shaHash: string = undefined;
      for (let i: number = 0; i < outputLines.length; i++) {
        const line: string = outputLines[i];
        const shaMatch: string[] = line.match(/^SHA-1 hash: (.+)$/);
        if (shaMatch) {
          shaHash = shaMatch[1];
        }

        const snbrMatch: string[] = line.match(/^\s*"snbr"<blob>=0x([^\s]+).+$/);
        if (snbrMatch && (snbrMatch[1] || '').toLowerCase() === serialNumber) {
          found = true;
          break;
        }
      }

      if (!found) {
        parentTask.logError('Unable to find the dev certificate.');
        return false;
      }

      parentTask.logVerbose(`Found the dev cert. SHA is ${shaHash}`);

      const macUntrustResult: ISudoSyncResult =
        runSudoSync(['security', 'delete-certificate', '-Z', shaHash, macKeychain]);

      if (macUntrustResult.code === 0) {
        parentTask.logVerbose('Successfully untrusted dev certificate.');
        return true;
      } else {
        parentTask.logError(macUntrustResult.stderr.join(' '));
        return false;
      }

    default:
      // Linux + others: Have the user manually untrust the cert
      parentTask.log( 'Automatic certificate untrust is only implemented for gulp-core-build-serve on Windows and ' +
                      'macOS. To untrust the development certificate, remove this certificate from your trusted ' +
                      `root certification authorities: "${CertificateStore.instance.certificatePath}". The ` +
                      `certificate has serial number "${serialNumber}".`);
      return false;
  }
}

/**
 * Get the dev certificate from the store, or, optionally, generate a new one and trust it if one doesn't exist in the
 *  store.
 */
export function ensureCertificate<TGulpTask>(
  canGenerateNewCertificate: boolean,
  parentTask: GulpTask<TGulpTask>
): ICertificate {
  const certificateStore: CertificateStore = CertificateStore.instance;

  if (certificateStore.certificateData && certificateStore.keyData) {
    if (!_certificateHasSubjectAltName(certificateStore.certificateData)) {
      let warningMessage: string = 'The existing development certificate is missing the subjectAltName ' +
                                    'property and will not work with the latest versions of some browsers. ';

      if (canGenerateNewCertificate) {
        warningMessage += ' Attempting to untrust the certificate and generate a new one.';
      } else {
        warningMessage += ' Untrust the certificate and generate a new one.';
      }

      parentTask.logWarning(warningMessage);

      if (canGenerateNewCertificate) {
        untrustCertificate(parentTask);
        _ensureCertificateInternal(parentTask);
      }
    }
  } else if (canGenerateNewCertificate) {
    _ensureCertificateInternal(parentTask);
  }

  return {
    pemCertificate: certificateStore.certificateData,
    pemKey: certificateStore.keyData
  };
}
