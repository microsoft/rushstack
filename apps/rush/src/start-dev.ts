// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This file is used during development to load the built-in plugins and to bypass
// some other checks

import * as rushLib from '@microsoft/rush-lib';
import { PackageJsonLookup, Import } from '@rushstack/node-core-library';

import { RushCommandSelector } from './RushCommandSelector';

const builtInPluginConfigurations: rushLib._IBuiltInPluginConfiguration[] = [];

function includePlugin(pluginName: string): void {
  const pluginPackageName: string = `@rushstack/${pluginName}`;
  builtInPluginConfigurations.push({
    packageName: pluginPackageName,
    pluginName: pluginName,
    pluginPackageFolder: Import.resolvePackage({
      packageName: pluginPackageName,
      baseFolderPath: __dirname
    })
  });
}

includePlugin('rush-amazon-s3-build-cache-plugin');
includePlugin('rush-azure-storage-build-cache-plugin');

const currentPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;
RushCommandSelector.execute(currentPackageVersion, rushLib, {
  isManaged: false,
  alreadyReportedNodeTooNewError: false,
  builtInPluginConfigurations
});
