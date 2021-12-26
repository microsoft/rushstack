// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Import } from '@rushstack/node-core-library';

import { IPluginLoaderBaseOptions, PluginLoaderBase } from './PluginLoaderBase';

export interface IBuiltInPluginLoaderOptions extends IPluginLoaderBaseOptions {
  builtInPluginsProjectRootPath: string;
}

/**
 * Built-in plugin loader.
 * Loading those plugins are directly installed by Rush.
 */
export class BuiltInPluginLoader extends PluginLoaderBase {
  private readonly _builtInPluginsProjectRootPath: string;

  public constructor(options: IBuiltInPluginLoaderOptions) {
    super(options);
    this._builtInPluginsProjectRootPath = options.builtInPluginsProjectRootPath;
  }

  protected override onGetPackageFolder(): string {
    const packageFolder: string = Import.resolvePackage({
      baseFolderPath: this._builtInPluginsProjectRootPath,
      packageName: this._packageName
    });
    return packageFolder;
  }
}
