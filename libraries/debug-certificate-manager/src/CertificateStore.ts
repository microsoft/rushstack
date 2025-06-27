// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { homedir } from 'os';

import { FileSystem } from '@rushstack/node-core-library';

/**
 * @public
 */
export interface ICertificateStoreOptions {
  /**
   * Path to the directory where the certificate store will be created.
   * If not provided, it defaults to `<homedir>/.rushstack`.
   */
  storePath?: string;
  /**
   * Filename of the CA certificate file within the store directory.
   * If not provided, it defaults to `rushstack-ca.pem`.
   */
  caCertificateFilename?: string;
  /**
   * Filename of the TLS certificate file within the store directory.
   * If not provided, it defaults to `rushstack-serve.pem`.
   */
  certificateFilename?: string;
  /**
   * Filename of the TLS key file within the store directory.
   * If not provided, it defaults to `rushstack-serve.key`.
   */
  keyFilename?: string;
}

/**
 * Store to retrieve and save debug certificate data.
 * @public
 */
export class CertificateStore {
  private readonly _caCertificatePath: string;
  private readonly _certificatePath: string;
  private readonly _keyPath: string;
  private readonly _storePath: string;

  private _caCertificateData: string | undefined;
  private _certificateData: string | undefined;
  private _keyData: string | undefined;

  public constructor(options: ICertificateStoreOptions = {}) {
    const storePath: string | undefined = options.storePath;
    if (storePath) {
      this._storePath = path.resolve(storePath);
    } else {
      // Default to the user's home directory under `.rushstack`
      const unresolvedUserFolder: string = homedir();
      const userProfilePath: string = path.resolve(unresolvedUserFolder);
      if (!FileSystem.exists(userProfilePath)) {
        throw new Error("Unable to determine the current user's home directory");
      }
      this._storePath = path.join(userProfilePath, '.rushstack');
    }
    FileSystem.ensureFolder(this._storePath);

    this._caCertificatePath = path.join(this._storePath, options.caCertificateFilename ?? 'rushstack-ca.pem');
    this._certificatePath = path.join(this._storePath, options.certificateFilename ?? 'rushstack-serve.pem');
    this._keyPath = path.join(this._storePath, options.keyFilename ?? 'rushstack-serve.key');
  }

  /**
   * Path to the saved debug CA certificate
   */
  public get caCertificatePath(): string {
    return this._caCertificatePath;
  }

  /**
   * Path to the saved debug TLS certificate
   */
  public get certificatePath(): string {
    return this._certificatePath;
  }

  /**
   * Path to the saved debug TLS key
   */
  public get keyPath(): string {
    return this._keyPath;
  }

  /**
   * Debug Certificate Authority certificate pem file contents.
   */
  public get caCertificateData(): string | undefined {
    if (!this._caCertificateData) {
      try {
        this._caCertificateData = FileSystem.readFile(this._caCertificatePath);
      } catch (err) {
        if (!FileSystem.isNotExistError(err)) {
          throw err;
        }
      }
    }

    return this._caCertificateData;
  }

  public set caCertificateData(certificate: string | undefined) {
    if (certificate) {
      FileSystem.writeFile(this._caCertificatePath, certificate);
    } else if (FileSystem.exists(this._caCertificatePath)) {
      FileSystem.deleteFile(this._caCertificatePath);
    }

    this._caCertificateData = certificate;
  }

  /**
   * Debug TLS Server certificate pem file contents.
   */
  public get certificateData(): string | undefined {
    if (!this._certificateData) {
      try {
        this._certificateData = FileSystem.readFile(this._certificatePath);
      } catch (err) {
        if (!FileSystem.isNotExistError(err)) {
          throw err;
        }
      }
    }

    return this._certificateData;
  }

  public set certificateData(certificate: string | undefined) {
    if (certificate) {
      FileSystem.writeFile(this._certificatePath, certificate);
    } else if (FileSystem.exists(this._certificatePath)) {
      FileSystem.deleteFile(this._certificatePath);
    }

    this._certificateData = certificate;
  }

  /**
   * Key used to sign the debug pem certificate.
   */
  public get keyData(): string | undefined {
    if (!this._keyData) {
      try {
        this._keyData = FileSystem.readFile(this._keyPath);
      } catch (err) {
        if (!FileSystem.isNotExistError(err)) {
          throw err;
        }
      }
    }

    return this._keyData;
  }

  public set keyData(key: string | undefined) {
    if (key) {
      FileSystem.writeFile(this._keyPath, key);
    } else if (FileSystem.exists(this._keyPath)) {
      FileSystem.deleteFile(this._keyPath);
    }

    this._keyData = key;
  }
}
