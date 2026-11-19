// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';

import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';
import { getRushLibPathHandoff, type IRushLibPathHandoff } from './RushLibPathHandoff';

function setRushLibPath(): IRushLibPathHandoff | undefined {
  const rootDir: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
  if (!rootDir) {
    return undefined;
  }
  // Route to the 'main' field of package.json
  const rushLibIndex: string = require.resolve(rootDir, { paths: [] });
  const handoff: IRushLibPathHandoff = getRushLibPathHandoff({
    packageFolder: rootDir,
    entryPoint: rushLibIndex,
    hostScriptPaths: [process.argv[1]],
    inheritedEntryPoint: process.env[EnvironmentVariableNames._RUSH_LIB_PATH]
  });
  process.env[EnvironmentVariableNames._RUSH_LIB_PATH] = handoff.entryPoint;
  return handoff;
}

/**
 * The `_RUSH_LIB_PATH` value that this rush-lib set when it was loaded.
 */
export const rushLibPathHandoff: IRushLibPathHandoff | undefined = setRushLibPath();
