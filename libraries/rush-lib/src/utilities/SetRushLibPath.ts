// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';

import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration.ts';

const rootDir: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
if (rootDir) {
  // Route to the 'main' field of package.json
  const rushLibIndex: string = require.resolve(rootDir, { paths: [] });
  process.env[EnvironmentVariableNames._RUSH_LIB_PATH] = rushLibIndex;
}
