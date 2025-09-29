// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { pki } from 'node-forge';
import * as path from 'node:path';
import { EOL } from 'node:os';
import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { darwinRunSudoAsync, type IRunResult, randomTmpPath, runAsync } from './runCommand';
import { CertificateStore, type ICertificateStoreOptions } from './CertificateStore';

const CA_SERIAL_NUMBER: string = '731c321744e34650a202e3ef91c3c1b0';
const TLS_SERIAL_NUMBER: string = '731c321744e34650a202e3ef00000001';
const FRIENDLY_NAME: string = 'debug-certificate-manager Development Certificate';
const MAC_KEYCHAIN: string = '/Library/Keychains/System.keychain';
const CERTUTIL_EXE_NAME: string = 'certutil';
const CA_ALT_NAME: string = 'rushstack-certificate-manager.localhost';
const ONE_DAY_IN_MILLISECONDS: number = 24 * 60 * 60 * 1000;

/**
 * The set of names the certificate should be generated for, by default.
 * @public
 */
export const DEFAULT_CERTIFICATE_SUBJECT_NAMES: ReadonlyArray<string> = ['localhost'];

/**
 * The set of ip addresses the certificate should be generated for, by default.
 * @public
 */
export const DEFAULT_CERTIFICATE_SUBJECT_IP_ADDRESSES: ReadonlyArray<string> = ['127.0.0.1'];

const DISABLE_CERT_GENERATION_VARIABLE_NAME: 'RUSHSTACK_DISABLE_DEV_CERT_GENERATION' =
  'RUSHSTACK_DISABLE_DEV_CERT_GENERATION';

/**
 * The interface for a debug certificate instance
 *
 * @public
 */
export interface ICertificate {
  /**
   * Generated pem Certificate Authority certificate contents
   */
  pemCaCertificate: string | undefined;

  /**
   * Generated pem TLS Server certificate contents
   */
  pemCertificate: string | undefined;

  /**
   * Private key for the TLS server certificate, used to sign TLS communications
   */
  pemKey: string | undefined;

  /**
   * The subject names the TLS server certificate is valid for
   */
  subjectAltNames: readonly string[] | undefined;
}

/**
 * Information about certificate validation results
 * @public
 */
export interface ICertificateValidationResult {
  /**
   * Whether valid certificates exist and are usable
   */
  isValid: boolean;

  /**
   * List of validation messages/issues found
   */
  validationMessages: string[];

  /**
   * The existing certificate if it exists and is valid
   */
  certificate?: ICertificate;
}

interface ICaCertificate {
  /**
   * Certificate
   */
  certificate: pki.Certificate;

  /**
   * Private key for the CA cert. Delete after signing the TLS cert.
   */
  privateKey: pki.PrivateKey;
}

interface ISubjectAltNameExtension {
  altNames: readonly IAltName[];
}

/**
 * Fields for a Subject Alternative Name of type DNS Name
 */
interface IDnsAltName {
  type: 2;
  value: string;
}
/**
 * Fields for a Subject Alternative Name of type IP Address
 * `node-forge` requires the field name to be "ip" instead of "value", likely due to subtle encoding differences.
 */
interface IIPAddressAltName {
  type: 7;
  ip: string;
}
type IAltName = IDnsAltName | IIPAddressAltName;

/**
 * Options to use if needing to generate a new certificate
 * @public
 */
export interface ICertificateGenerationOptions {
  /**
   * The DNS Subject names to issue the certificate for. Defaults to ['localhost'].
   */
  subjectAltNames?: ReadonlyArray<string>;
  /**
   * The IP Address Subject names to issue the certificate for. Defaults to ['127.0.0.1'].
   */
  subjectIPAddresses?: ReadonlyArray<string>;
  /**
   * How many days the certificate should be valid for.
   */
  validityInDays?: number;
  /**
   * Skip trusting a certificate. Defaults to false.
   */
  skipCertificateTrust?: boolean;
}

/**
 * Options for configuring the `CertificateManager`.
 * @public
 */
export interface ICertificateManagerOptions extends ICertificateStoreOptions {}

const MAX_CERTIFICATE_VALIDITY_DAYS: 365 = 365;

const VS_CODE_EXTENSION_FIX_MESSAGE: string =
  'Use the "Debug Certificate Manager Extension" for VS Code and run the ' +
  '"Debug Certificate Manager: Ensure and Sync TLS Certificates" command to fix certificate issues. ';

/**
 * A utility class to handle generating, trusting, and untrustring a debug certificate.
 * Contains two public methods to `ensureCertificate` and `untrustCertificate`.
 * @public
 */
export class CertificateManager {
  /**
   * Get the certificate store used by this manager.
   * @public
   */
  public readonly certificateStore: CertificateStore;

  public constructor(options: ICertificateManagerOptions = {}) {
    this.certificateStore = new CertificateStore(options);
  }

  /**
   * Get a development certificate from the store, or optionally, generate a new one
   * and trust it if one doesn't exist in the store.
   *
   * @public
   */
  public async ensureCertificateAsync(
    canGenerateNewCertificate: boolean,
    terminal: ITerminal,
    options?: ICertificateGenerationOptions
  ): Promise<ICertificate> {
    const optionsWithDefaults: Required<ICertificateGenerationOptions> = applyDefaultOptions(options);

    if (process.env[DISABLE_CERT_GENERATION_VARIABLE_NAME] === '1') {
      // Allow the environment (e.g. GitHub codespaces) to forcibly disable dev cert generation
      terminal.writeLine(
        `Found environment variable ${DISABLE_CERT_GENERATION_VARIABLE_NAME}=1, disabling certificate generation. ` +
          VS_CODE_EXTENSION_FIX_MESSAGE
      );
      canGenerateNewCertificate = false;
    }

    // Validate existing certificates
    const validationResult: ICertificateValidationResult = await this.validateCertificateAsync(
      terminal,
      options
    );

    if (validationResult.isValid && validationResult.certificate) {
      // Existing certificate is valid, return it
      return validationResult.certificate;
    }

    // Certificate is invalid or doesn't exist
    if (validationResult.validationMessages.length > 0) {
      if (canGenerateNewCertificate) {
        validationResult.validationMessages.push(
          'Attempting to untrust the certificate and generate a new one.'
        );
        terminal.writeWarningLine(validationResult.validationMessages.join(' '));
        if (!options?.skipCertificateTrust) {
          await this.untrustCertificateAsync(terminal);
        }
        return await this._ensureCertificateInternalAsync(optionsWithDefaults, terminal);
      } else {
        validationResult.validationMessages.push(
          'Untrust the certificate and generate a new one, or set the ' +
            '`canGenerateNewCertificate` parameter to `true` when calling `ensureCertificateAsync`. ' +
            VS_CODE_EXTENSION_FIX_MESSAGE
        );
        throw new Error(validationResult.validationMessages.join(' '));
      }
    } else if (canGenerateNewCertificate) {
      return await this._ensureCertificateInternalAsync(optionsWithDefaults, terminal);
    } else {
      throw new Error(
        'No development certificate found. Generate a new certificate manually, or set the ' +
          '`canGenerateNewCertificate` parameter to `true` when calling `ensureCertificateAsync`. ' +
          VS_CODE_EXTENSION_FIX_MESSAGE
      );
    }
  }

  /**
   * Attempt to locate a previously generated debug certificate and untrust it.
   *
   * @public
   */
  public async untrustCertificateAsync(terminal: ITerminal): Promise<boolean> {
    this.certificateStore.certificateData = undefined;
    this.certificateStore.keyData = undefined;
    this.certificateStore.caCertificateData = undefined;

    switch (process.platform) {
      case 'win32':
        const winUntrustResult: IRunResult = await runAsync(CERTUTIL_EXE_NAME, [
          '-user',
          '-delstore',
          'root',
          CA_SERIAL_NUMBER
        ]);

        if (winUntrustResult.exitCode !== 0) {
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
          CA_ALT_NAME,
          '-a',
          '-Z',
          MAC_KEYCHAIN
        ]);
        if (macFindCertificateResult.exitCode !== 0) {
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

        const macUntrustResult: IRunResult = await darwinRunSudoAsync(terminal, 'security', [
          'delete-certificate',
          '-Z',
          shaHash,
          MAC_KEYCHAIN
        ]);

        if (macUntrustResult.exitCode === 0) {
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
            `root certification authorities: "${this.certificateStore.certificatePath}". The ` +
            `certificate has serial number "${CA_SERIAL_NUMBER}".`
        );
        return false;
    }
  }

  private async _createCACertificateAsync(
    validityInDays: number,
    forge: typeof import('node-forge')
  ): Promise<ICaCertificate> {
    const keys: pki.KeyPair = forge.pki.rsa.generateKeyPair(2048);
    const certificate: pki.Certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;

    certificate.serialNumber = CA_SERIAL_NUMBER;

    const notBefore: Date = new Date();
    const notAfter: Date = new Date(notBefore);
    notAfter.setUTCDate(notBefore.getUTCDate() + validityInDays);
    certificate.validity.notBefore = notBefore;
    certificate.validity.notAfter = notAfter;

    const attrs: pki.CertificateField[] = [
      {
        name: 'commonName',
        value: CA_ALT_NAME
      }
    ];

    certificate.setSubject(attrs);
    certificate.setIssuer(attrs);

    const altNames: readonly IAltName[] = [
      {
        type: 2, // DNS
        value: CA_ALT_NAME
      }
    ];

    certificate.setExtensions([
      {
        name: 'basicConstraints',
        cA: true,
        pathLenConstraint: 0,
        critical: true
      },
      {
        name: 'subjectAltName',
        altNames,
        critical: true
      },
      {
        name: 'issuerAltName',
        altNames,
        critical: false
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        critical: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        critical: true
      },
      {
        name: 'friendlyName',
        value: FRIENDLY_NAME
      }
    ]);

    // self-sign certificate
    certificate.sign(keys.privateKey, forge.md.sha256.create());

    return {
      certificate,
      privateKey: keys.privateKey
    };
  }

  private async _createDevelopmentCertificateAsync(
    options: Required<ICertificateGenerationOptions>
  ): Promise<ICertificate> {
    const forge: typeof import('node-forge') = await import('node-forge');
    const keys: pki.KeyPair = forge.pki.rsa.generateKeyPair(2048);
    const certificate: pki.Certificate = forge.pki.createCertificate();

    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = TLS_SERIAL_NUMBER;

    const { subjectAltNames: subjectNames, subjectIPAddresses: subjectIpAddresses, validityInDays } = options;

    const { certificate: caCertificate, privateKey: caPrivateKey } = await this._createCACertificateAsync(
      validityInDays,
      forge
    );

    const notBefore: Date = new Date();
    const notAfter: Date = new Date(notBefore);
    notAfter.setUTCDate(notBefore.getUTCDate() + validityInDays);
    certificate.validity.notBefore = notBefore;
    certificate.validity.notAfter = notAfter;

    const subjectAttrs: pki.CertificateField[] = [
      {
        name: 'commonName',
        value: subjectNames[0]
      }
    ];
    const issuerAttrs: pki.CertificateField[] = caCertificate.subject.attributes;

    certificate.setSubject(subjectAttrs);
    certificate.setIssuer(issuerAttrs);

    const subjectAltNames: IAltName[] = [
      ...subjectNames.map<IDnsAltName>((subjectName) => ({
        type: 2, // DNS
        value: subjectName
      })),
      ...subjectIpAddresses.map<IIPAddressAltName>((ip) => ({
        type: 7, // IP
        ip
      }))
    ];

    const issuerAltNames: readonly IAltName[] = [
      {
        type: 2, // DNS
        value: CA_ALT_NAME
      }
    ];

    certificate.setExtensions([
      {
        name: 'basicConstraints',
        cA: false,
        critical: true
      },
      {
        name: 'subjectAltName',
        altNames: subjectAltNames,
        critical: true
      },
      {
        name: 'issuerAltName',
        altNames: issuerAltNames,
        critical: false
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        dataEncipherment: true,
        critical: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        critical: true
      },
      {
        name: 'friendlyName',
        value: FRIENDLY_NAME
      }
    ]);

    // Sign certificate with CA
    certificate.sign(caPrivateKey, forge.md.sha256.create());

    // convert a Forge certificate to PEM
    const caPem: string = forge.pki.certificateToPem(caCertificate);
    const pem: string = forge.pki.certificateToPem(certificate);
    const pemKey: string = forge.pki.privateKeyToPem(keys.privateKey);

    return {
      pemCaCertificate: caPem,
      pemCertificate: pem,
      pemKey: pemKey,
      subjectAltNames: options.subjectAltNames
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

        if (winTrustResult.exitCode !== 0) {
          terminal.writeErrorLine(`Error: ${winTrustResult.stdout.toString()}`);

          const errorLines: string[] = winTrustResult.stdout
            .toString()
            .split(EOL)
            .map((line: string) => line.trim());

          // Not sure if this is always the status code for "cancelled" - should confirm.
          if (
            winTrustResult.exitCode === 2147943623 ||
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

        const result: IRunResult = await darwinRunSudoAsync(terminal, 'security', [
          'add-trusted-cert',
          '-d',
          '-r',
          'trustRoot',
          '-k',
          MAC_KEYCHAIN,
          certificatePath
        ]);

        if (result.exitCode === 0) {
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
              `Certificate trust failed with an unknown error. Exit code: ${result.exitCode}. ` +
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
          CA_SERIAL_NUMBER
        ]);

        if (winVerifyStoreResult.exitCode !== 0) {
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
          CA_ALT_NAME,
          '-a',
          '-Z',
          MAC_KEYCHAIN
        ]);

        if (macFindCertificateResult.exitCode !== 0) {
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
            `root certification authorities: "${this.certificateStore.certificatePath}". ` +
            `The certificate has serial number "${CA_SERIAL_NUMBER}".`
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
        '-repairstore',
        '-user',
        'root',
        CA_SERIAL_NUMBER,
        friendlyNamePath
      ]);

      if (repairStoreResult.exitCode !== 0) {
        terminal.writeVerboseLine(`CertUtil Error: ${repairStoreResult.stderr.join('')}`);
        terminal.writeVerboseLine(`CertUtil: ${repairStoreResult.stdout.join('')}`);
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

  private async _ensureCertificateInternalAsync(
    options: Required<ICertificateGenerationOptions>,
    terminal: ITerminal
  ): Promise<ICertificate> {
    const certificateStore: CertificateStore = this.certificateStore;
    const generatedCertificate: ICertificate = await this._createDevelopmentCertificateAsync(options);

    const certificateName: string = Date.now().toString();
    const tempDirName: string = randomTmpPath('rushstack', 'temp');
    await FileSystem.ensureFolderAsync(tempDirName);

    const tempCertificatePath: string = path.join(tempDirName, `${certificateName}.pem`);
    const pemFileContents: string | undefined = generatedCertificate.pemCaCertificate;
    if (pemFileContents) {
      await FileSystem.writeFileAsync(tempCertificatePath, pemFileContents, {
        ensureFolderExists: true
      });
    }

    const trustCertificateResult: boolean = options.skipCertificateTrust
      ? true
      : await this._tryTrustCertificateAsync(tempCertificatePath, terminal);

    let subjectAltNames: readonly string[] | undefined;
    if (trustCertificateResult) {
      certificateStore.caCertificateData = generatedCertificate.pemCaCertificate;
      certificateStore.certificateData = generatedCertificate.pemCertificate;
      certificateStore.keyData = generatedCertificate.pemKey;
      subjectAltNames = generatedCertificate.subjectAltNames;

      // Try to set the friendly name, and warn if we can't
      if (!(await this._trySetFriendlyNameAsync(tempCertificatePath, terminal))) {
        terminal.writeWarningLine("Unable to set the certificate's friendly name.");
      }
    } else {
      // Clear out the existing store data, if any exists
      certificateStore.caCertificateData = undefined;
      certificateStore.certificateData = undefined;
      certificateStore.keyData = undefined;
    }

    await FileSystem.deleteFileAsync(tempCertificatePath);

    return {
      pemCaCertificate: certificateStore.caCertificateData,
      pemCertificate: certificateStore.certificateData,
      pemKey: certificateStore.keyData,
      subjectAltNames
    };
  }

  /**
   * Validate existing certificates to check if they are usable.
   *
   * @public
   */
  public async validateCertificateAsync(
    terminal: ITerminal,
    options?: ICertificateGenerationOptions
  ): Promise<ICertificateValidationResult> {
    const optionsWithDefaults: Required<ICertificateGenerationOptions> = applyDefaultOptions(options);
    const { certificateData: existingCert, keyData: existingKey } = this.certificateStore;

    if (!existingCert || !existingKey) {
      return {
        isValid: false,
        validationMessages: ['No development certificate found.']
      };
    }

    const messages: string[] = [];

    const forge: typeof import('node-forge') = await import('node-forge');
    const parsedCertificate: pki.Certificate = forge.pki.certificateFromPem(existingCert);
    const altNamesExtension: ISubjectAltNameExtension | undefined = parsedCertificate.getExtension(
      'subjectAltName'
    ) as ISubjectAltNameExtension;

    if (!altNamesExtension) {
      messages.push(
        'The existing development certificate is missing the subjectAltName ' +
          'property and will not work with the latest versions of some browsers.'
      );
    } else {
      const missingSubjectNames: Set<string> = new Set(optionsWithDefaults.subjectAltNames);
      for (const altName of altNamesExtension.altNames) {
        missingSubjectNames.delete(isIPAddress(altName) ? altName.ip : altName.value);
      }
      if (missingSubjectNames.size) {
        messages.push(
          `The existing development certificate does not include the following expected subjectAltName values: ` +
            Array.from(missingSubjectNames, (name: string) => `"${name}"`).join(', ')
        );
      }
    }

    const { notBefore, notAfter } = parsedCertificate.validity;
    const now: Date = new Date();
    if (now < notBefore) {
      messages.push(
        `The existing development certificate's validity period does not start until ${notBefore}. It is currently ${now}.`
      );
    }

    if (now > notAfter) {
      messages.push(
        `The existing development certificate's validity period ended ${notAfter}. It is currently ${now}.`
      );
    }

    now.setUTCDate(now.getUTCDate() + optionsWithDefaults.validityInDays);
    if (notAfter > now) {
      messages.push(
        `The existing development certificate's expiration date ${notAfter} exceeds the allowed limit ${now}. ` +
          `This will be rejected by many browsers.`
      );
    }

    if (
      notBefore.getTime() - notAfter.getTime() >
      optionsWithDefaults.validityInDays * ONE_DAY_IN_MILLISECONDS
    ) {
      messages.push(
        "The existing development certificate's validity period is longer " +
          `than ${optionsWithDefaults.validityInDays} days.`
      );
    }

    const { caCertificateData } = this.certificateStore;

    if (!caCertificateData) {
      messages.push(
        'The existing development certificate is missing a separate CA cert as the root ' +
          'of trust and will not work with the latest versions of some browsers.'
      );
    }

    const isTrusted: boolean = await this._detectIfCertificateIsTrustedAsync(terminal);
    if (!isTrusted) {
      messages.push('The existing development certificate is not currently trusted by your system.');
    }

    const isValid: boolean = messages.length === 0;
    const validCertificate: ICertificate | undefined = isValid
      ? {
          pemCaCertificate: caCertificateData,
          pemCertificate: existingCert,
          pemKey: existingKey,
          subjectAltNames: altNamesExtension?.altNames.map((entry) =>
            isIPAddress(entry) ? entry.ip : entry.value
          )
        }
      : undefined;

    return {
      isValid,
      validationMessages: messages,
      certificate: validCertificate
    };
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
      if (snbrMatch && (snbrMatch[1] || '').toLowerCase() === CA_SERIAL_NUMBER) {
        return shaHash;
      }
    }
  }
}

function applyDefaultOptions(
  options: ICertificateGenerationOptions | undefined
): Required<ICertificateGenerationOptions> {
  const subjectNames: ReadonlyArray<string> | undefined = options?.subjectAltNames;
  const subjectIpAddresses: ReadonlyArray<string> | undefined = options?.subjectIPAddresses;
  const skipCertificateTrust: boolean | undefined = options?.skipCertificateTrust || false;
  return {
    subjectAltNames: subjectNames?.length ? subjectNames : DEFAULT_CERTIFICATE_SUBJECT_NAMES,
    subjectIPAddresses: subjectIpAddresses?.length
      ? subjectIpAddresses
      : DEFAULT_CERTIFICATE_SUBJECT_IP_ADDRESSES,
    validityInDays: Math.min(
      MAX_CERTIFICATE_VALIDITY_DAYS,
      options?.validityInDays ?? MAX_CERTIFICATE_VALIDITY_DAYS
    ),
    skipCertificateTrust: skipCertificateTrust
  };
}

function isIPAddress(altName: IAltName): altName is IIPAddressAltName {
  return altName.type === 7;
}
