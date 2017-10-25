// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export default class PrereleaseToken {
  private _name: string;

  constructor(private _prereleaseName?: string, private _suffixName?: string) {
    if (_prereleaseName && _suffixName) {
      throw new Error('Pre-release name and suffix cannot be provided at the same time.');
    }
    this._name = _prereleaseName! || _suffixName!;
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