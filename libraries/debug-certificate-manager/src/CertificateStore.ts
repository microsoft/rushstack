// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { homedir } from 'os';

import { FileSystem } from '@rushstack/node-core-library';

/**
 * Store to retrieve and save debug certificate data.
 * @public
 */
export class CertificateStore {
  private _userProfilePath: string;
  private _serveDataPath: string;
  private _certificatePath: string;
  private _keyPath: string;

  private _certificateData: string | undefined;
  private _keyData: string | undefined;

  public constructor() {
    const unresolvedUserFolder: string = homedir();
    this._userProfilePath = path.resolve(unresolvedUserFolder);
    if (!FileSystem.exists(this._userProfilePath)) {
      throw new Error('Unable to determine the current user\'s home directory');
    }

    this._serveDataPath = path.join(this._userProfilePath, '.rushstack');
    FileSystem.ensureFolder(this._serveDataPath);

    this._certificatePath = path.join(this._serveDataPath, 'rushstack-serve.pem');
    this._keyPath = path.join(this._serveDataPath, 'rushstack-serve.key');
  }

  /**
   * Path to the saved debug certificate
   */
  public get certificatePath(): string {
    return this._certificatePath;
  }

  /**
   * Debug certificate pem file contents.
   */
  public get certificateData(): string | undefined {
    if (!this._certificateData) {
      if (FileSystem.exists(this._certificatePath)) {
        this._certificateData = FileSystem.readFile(this._certificatePath);
      } else {
        return undefined;
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
      if (FileSystem.exists(this._keyPath)) {
        this._keyData = FileSystem.readFile(this._keyPath);
      } else {
        return undefined;
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
