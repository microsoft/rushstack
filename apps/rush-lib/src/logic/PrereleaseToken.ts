// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class PrereleaseToken {
  private _name: string;
  private _prereleaseName: string | undefined;
  private _suffixName: string | undefined;

  constructor(prereleaseName?: string, suffixName?: string) {
    if (prereleaseName && suffixName) {
      throw new Error('Pre-release name and suffix cannot be provided at the same time.');
    }
    this._name = prereleaseName! || suffixName!;
    this._prereleaseName = prereleaseName;
    this._suffixName = suffixName;
  }

  public get hasValue(): boolean {
    return !!this._prereleaseName || !!this._suffixName;
  }

  public get isPrerelease(): boolean {
    return !!this._prereleaseName;
  }

  public get isSuffix(): boolean {
    return !!this._suffixName;
  }

  public get name(): string {
    return this._name;
  }
}