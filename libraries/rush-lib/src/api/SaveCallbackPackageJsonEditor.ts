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
  private readonly _onSaved: ((newObject: IPackageJson) => void) | undefined;

  private constructor(options: IFromObjectOptions) {
    super(options.filename, options.object);

    this._onSaved = options.onSaved;
  }

  public static fromObjectWithCallback(options: IFromObjectOptions): SaveCallbackPackageJsonEditor {
    return new SaveCallbackPackageJsonEditor(options);
  }

  public saveIfModified(): boolean {
    const modified: boolean = super.saveIfModified();
    if (this._onSaved) {
      this._onSaved(this.saveToObject());
    }

    return modified;
  }
}
