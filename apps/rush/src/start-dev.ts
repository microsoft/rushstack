// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This file is used during development to load the built-in plugins and to bypass
// some other checks

import * as rushLib from '@microsoft/rush-lib/lib/index';
import { PackageJsonLookup, Import } from '@rushstack/node-core-library';

import { RushCommandSelector } from './RushCommandSelector';

const builtInPluginConfigurations: rushLib._IBuiltInPluginConfiguration[] = [];

function includePlugin(pluginName: string, pluginPackageName?: string): void {
  if (!pluginPackageName) {
    pluginPackageName = `@rushstack/${pluginName}`;
  }
  builtInPluginConfigurations.push({
    packageName: pluginPackageName,
    pluginName: pluginName,
    pluginPackageFolder: Import.resolvePackage({
      packageName: pluginPackageName,
      baseFolderPath: __dirname,
      useNodeJSResolver: true
    })
  });
}

includePlugin('rush-amazon-s3-build-cache-plugin');
includePlugin('rush-azure-storage-build-cache-plugin');
includePlugin('rush-http-build-cache-plugin');
// Including this here so that developers can reuse it without installing the plugin a second time
includePlugin('rush-azure-interactive-auth-plugin', '@rushstack/rush-azure-storage-build-cache-plugin');
includePlugin('rush-npm-publish-plugin');

const currentPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;
RushCommandSelector.execute(currentPackageVersion, rushLib, {
  isManaged: false,
  alreadyReportedNodeTooNewError: false,
  builtInPluginConfigurations
});
