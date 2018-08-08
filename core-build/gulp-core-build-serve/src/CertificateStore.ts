// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { homedir } from 'os';

import { FileSystem } from '@microsoft/node-core-library';

export class CertificateStore {
  private static _instance: CertificateStore;

  public static get instance(): CertificateStore {
    if (!CertificateStore._instance) {
      CertificateStore._instance = new CertificateStore();
      CertificateStore._instance._initialize();
    }

    return CertificateStore._instance;
  }

  private _userProfilePath: string;
  private _gcbServeDataPath: string;
  private _certificatePath: string;
  private _keyPath: string;

  private _certificateData: string;
  private _keyData: string;

  public get certificatePath(): string {
    return this._certificatePath;
  }

  public get certificateData(): string {
    if (!this._certificateData) {
      if (FileSystem.exists(this._certificatePath)) {
        this._certificateData = FileSystem.readFile(this._certificatePath);
      } else {
        return undefined;
      }
    }

    return this._certificateData;
  }

  public set certificateData(certificate: string) {
    if (certificate) {
      FileSystem.writeFile(this._certificatePath, certificate);
    } else if (FileSystem.exists(this._certificatePath)) {
      FileSystem.deleteFile(this._certificatePath);
    }

    this._certificateData = certificate;
  }

  public get keyData(): string {
    if (!this._keyData) {
      if (FileSystem.exists(this._keyPath)) {
        this._keyData = FileSystem.readFile(this._keyPath);
      } else {
        return undefined;
      }
    }

    return this._keyData;
  }

  public set keyData(key: string) {
    if (key) {
      FileSystem.writeFile(this._keyPath, key);
    } else if (FileSystem.exists(this._keyPath)) {
      FileSystem.deleteFile(this._keyPath);
    }

    this._keyData = key;
  }

  private _initialize(): void {
    const unresolvedUserFolder: string = homedir();
    this._userProfilePath = path.resolve(unresolvedUserFolder);
    if (!FileSystem.exists(this._userProfilePath)) {
      throw new Error('Unable to determine the current user\'s home directory');
    }

    this._gcbServeDataPath = path.join(this._userProfilePath, '.gcb-serve-data');
    FileSystem.ensureFolder(this._gcbServeDataPath);

    this._certificatePath = path.join(this._gcbServeDataPath, 'gcb-serve.cer');
    this._keyPath = path.join(this._gcbServeDataPath, 'gcb-serve.key');
  }
}
