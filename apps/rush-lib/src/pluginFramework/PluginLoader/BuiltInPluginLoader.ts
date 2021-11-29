// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Import } from '@rushstack/node-core-library';

import { PluginLoaderBase } from './PluginLoaderBase';

/**
 * Built-in plugin loader.
 * Loading those plugins are directly installed by Rush.
 */
export class BuiltInPluginLoader extends PluginLoaderBase {
  protected override onGetPackageFolder(): string {
    const packageFolder: string = Import.resolvePackage({
      baseFolderPath: __dirname,
      packageName: this._packageName
    });
    return packageFolder;
  }
}
