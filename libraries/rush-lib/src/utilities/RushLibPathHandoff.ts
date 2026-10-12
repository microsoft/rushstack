// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

const RUSH_LIB_PACKAGE_NAME: string = '@microsoft/rush-lib';

/**
 * The rush-lib entry point that Rush hands to plugins and child processes as `_RUSH_LIB_PATH`.
 */
export interface IRushLibPathHandoff {
  /** The entry point handed off as `_RUSH_LIB_PATH`. */
  readonly entryPoint: string;
  /** The rush-lib package folder, spelled the same way as `entryPoint`. */
  readonly packageFolder: string;
}

export interface IGetRushLibPathHandoffOptions {
  /** The folder of the loaded rush-lib package. */
  readonly packageFolder: string;
  /** The loaded rush-lib entry point, inside `packageFolder`. */
  readonly entryPoint: string;
  /** Scripts whose own `node_modules` folders may link rush-lib, such as `process.argv[1]`. */
  readonly hostScriptPaths: ReadonlyArray<string | undefined>;
  /** The inherited `_RUSH_LIB_PATH` value, if any. */
  readonly inheritedEntryPoint: string | undefined;
}

/**
 * Returns the first `node_modules/<packageName>` folder that Node.js module lookup finds from `startFolder`.
 * Symbolic links are not followed, so the result keeps the spelling of `startFolder`.
 */
export function findNodeModulesPackageFolder(startFolder: string, packageName: string): string | undefined {
  let folder: string = path.resolve(startFolder);
  for (;;) {
    if (path.basename(folder) !== 'node_modules') {
      const packageFolder: string = path.join(folder, 'node_modules', packageName);
      if (FileSystem.exists(path.join(packageFolder, 'package.json'))) {
        return packageFolder;
      }
    }
    const parentFolder: string = path.dirname(folder);
    if (parentFolder === folder) {
      return undefined;
    }
    folder = parentFolder;
  }
}

/**
 * Chooses how to spell the rush-lib entry point in `_RUSH_LIB_PATH`.
 *
 * @remarks
 * Plugins resolve `@microsoft/rush-lib` and its dependencies by name from `_RUSH_LIB_PATH`. That needs a
 * `node_modules/@microsoft/rush-lib` folder above the path. Installed packages always have one, so their real
 * path is used unchanged. A local project folder, such as one in a `rush deploy` output, doesn't. Its entry
 * point is spelled through the `node_modules` link of the host script that loaded it, or else of an inherited
 * `_RUSH_LIB_PATH` that points at the same file.
 */
export function getRushLibPathHandoff(options: IGetRushLibPathHandoffOptions): IRushLibPathHandoff {
  const { packageFolder, entryPoint, hostScriptPaths, inheritedEntryPoint } = options;
  const realPackageFolder: string | undefined = tryGetRealPath(packageFolder);
  const findRushLibLink: (fromPath: string) => string | undefined = (fromPath: string) => {
    const linkFolder: string | undefined = findNodeModulesPackageFolder(
      path.dirname(fromPath),
      RUSH_LIB_PACKAGE_NAME
    );
    return linkFolder !== undefined && tryGetRealPath(linkFolder) === realPackageFolder
      ? linkFolder
      : undefined;
  };

  if (realPackageFolder === undefined || findRushLibLink(entryPoint) !== undefined) {
    return { entryPoint, packageFolder };
  }

  const relativeEntryPoint: string = path.relative(packageFolder, entryPoint);
  for (const hostScriptPath of hostScriptPaths) {
    const realHostScriptPath: string | undefined = hostScriptPath ? tryGetRealPath(hostScriptPath) : undefined;
    const linkFolder: string | undefined = realHostScriptPath ? findRushLibLink(realHostScriptPath) : undefined;
    if (linkFolder !== undefined) {
      return { entryPoint: path.join(linkFolder, relativeEntryPoint), packageFolder: linkFolder };
    }
  }

  if (inheritedEntryPoint && tryGetRealPath(inheritedEntryPoint) === tryGetRealPath(entryPoint)) {
    const linkFolder: string | undefined = findRushLibLink(inheritedEntryPoint);
    const spelledEntryPoint: string | undefined =
      linkFolder !== undefined ? path.join(linkFolder, relativeEntryPoint) : undefined;
    if (linkFolder !== undefined && spelledEntryPoint === path.resolve(inheritedEntryPoint)) {
      return { entryPoint: spelledEntryPoint, packageFolder: linkFolder };
    }
  }

  return { entryPoint, packageFolder };
}

function tryGetRealPath(fileOrFolderPath: string): string | undefined {
  try {
    return FileSystem.getRealPath(fileOrFolderPath);
  } catch {
    return undefined;
  }
}
