// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class PrereleaseToken {
  #prereleaseName: string | undefined;
  #suffixName: string | undefined;
  #partialPrerelease: boolean;

  public readonly name: string;

  public constructor(prereleaseName?: string, suffixName?: string, partialPrerelease: boolean = false) {
    if (prereleaseName && suffixName) {
      throw new Error('Pre-release name and suffix cannot be provided at the same time.');
    }
    this.name = prereleaseName! || suffixName!;
    this.#prereleaseName = prereleaseName;
    this.#suffixName = suffixName;
    this.#partialPrerelease = partialPrerelease;
  }

  public get hasValue(): boolean {
    return !!this.#prereleaseName || !!this.#suffixName;
  }

  public get isPrerelease(): boolean {
    return !!this.#prereleaseName;
  }

  public get isSuffix(): boolean {
    return !!this.#suffixName;
  }

  public get isPartialPrerelease(): boolean {
    return this.isPrerelease && this.#partialPrerelease;
  }
}
