// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';

import { PackageJsonEditor } from './PackageJsonEditor';

export interface IFromObjectOptions {
  object: IPackageJson;
  filename: string;
  onSaved?: (newObject: IPackageJson) => void;
}

export class SaveCallbackPackageJsonEditor extends PackageJsonEditor {
  readonly #onSaved: ((newObject: IPackageJson) => void) | undefined;

  private constructor(options: IFromObjectOptions) {
    super(options.filename, options.object);

    this.#onSaved = options.onSaved;
  }

  public static fromObjectWithCallback(options: IFromObjectOptions): SaveCallbackPackageJsonEditor {
    return new SaveCallbackPackageJsonEditor(options);
  }

  public override async saveIfModifiedAsync(): Promise<boolean> {
    const modified: boolean = await super.saveIfModifiedAsync();
    if (this.#onSaved) {
      this.#onSaved(this.saveToObject());
    }

    return modified;
  }
}
