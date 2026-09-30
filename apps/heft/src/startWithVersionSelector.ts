// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-console */

// NOTE: Since startWithVersionSelector.ts is loaded in the same process as start.ts, any dependencies that
// we import here may become side-by-side versions.  We want to minimize any dependencies.
// This file is on the startup path of every Heft invocation, so it intentionally only uses Node.js
// built-in modules (named imports avoid the interop helpers) and inlines the few constants it needs.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { IPackageJson } from '@rushstack/node-core-library';

// These must match the values in ./utilities/Constants.ts
const HEFT_PACKAGE_NAME: '@rushstack/heft' = '@rushstack/heft';
const UNMANAGED_PARAMETER_LONG_NAME: '--unmanaged' = '--unmanaged';
const DEBUG_PARAMETER_LONG_NAME: '--debug' = '--debug';

// Excerpted from PackageJsonLookup.tryGetPackageFolderFor()
function tryGetPackageFolderFor(resolvedFileOrFolderPath: string): string | undefined {
  // Walk upwards until a folder containing a package.json file is found
  let currentFolder: string = resolvedFileOrFolderPath;
  for (;;) {
    // Is currentFolder itself a folder with a package.json file?  If so, return it.
    if (existsSync(join(currentFolder, 'package.json'))) {
      return currentFolder;
    }

    // Otherwise go up one level
    const parentFolder: string | undefined = dirname(currentFolder);
    if (!parentFolder || parentFolder === currentFolder) {
      // We reached the root directory without finding a package.json file
      return undefined; // no match
    }

    currentFolder = parentFolder;
  }
}

/**
 * Returns the tool parameter names that precede the action name. This is a copy of
 * `getToolParameterNamesFromArgs()` from ./utilities/CliUtilities.ts, inlined to avoid loading extra modules.
 */
function getToolParameterNamesFromArgs(argv: string[] = process.argv): Set<string> {
  const toolParameters: Set<string> = new Set();
  // Skip the first two arguments, which are the path to the Node executable and the path to the Heft
  // entrypoint. The remaining arguments are the tool arguments. Grab them until we reach a non-"-"-prefixed
  // argument. We can do this simple parsing because the Heft tool only has simple optional flags.
  for (let i: number = 2; i < argv.length; ++i) {
    const arg: string = argv[i];
    if (!arg.startsWith('-')) {
      break;
    }
    toolParameters.add(arg);
  }
  return toolParameters;
}

/**
 * When Heft is invoked via the shell path, we examine the project's package.json dependencies and try to load
 * the locally installed version of Heft. This avoids accidentally building using the wrong version of Heft.
 * Use "heft --unmanaged" to bypass this feature.
 */
function tryStartLocalHeft(): boolean {
  const toolParameters: Set<string> = getToolParameterNamesFromArgs();
  if (toolParameters.has(UNMANAGED_PARAMETER_LONG_NAME)) {
    console.log(
      `Bypassing the Heft version selector because ${JSON.stringify(UNMANAGED_PARAMETER_LONG_NAME)} ` +
        'was specified.'
    );
    console.log();
    return false;
  } else if (toolParameters.has(DEBUG_PARAMETER_LONG_NAME)) {
    // The unmanaged flag could be undiscoverable if it's not in their locally installed version
    console.log(
      'Searching for a locally installed version of Heft. Use the ' +
        `${JSON.stringify(UNMANAGED_PARAMETER_LONG_NAME)} flag if you want to avoid this.`
    );
  }

  // Find the package.json file that governs the current folder location
  const projectFolder: string | undefined = tryGetPackageFolderFor(process.cwd());
  if (projectFolder) {
    let heftEntryPoint: string;
    try {
      const packageJsonPath: string = join(projectFolder, 'package.json');
      const packageJsonContent: string = readFileSync(packageJsonPath).toString();
      let packageJson: IPackageJson;
      try {
        packageJson = JSON.parse(packageJsonContent);
      } catch (error) {
        throw new Error(`Error parsing ${packageJsonPath}:` + (error as Error).message);
      }

      // Does package.json have a dependency on Heft?
      if (
        !(packageJson.dependencies && packageJson.dependencies[HEFT_PACKAGE_NAME]) &&
        !(packageJson.devDependencies && packageJson.devDependencies[HEFT_PACKAGE_NAME])
      ) {
        // No explicit dependency on Heft
        return false;
      }

      // To avoid a loading the "resolve" NPM package, let's assume that the Heft dependency must be
      // installed as "<projectFolder>/node_modules/@rushstack/heft".
      const heftFolder: string = join(projectFolder, 'node_modules', HEFT_PACKAGE_NAME);

      // Try the new output layout first, then fall back to the legacy layout
      const commonJsHeftEntryPoint: string = join(heftFolder, 'lib-commonjs', 'start.js');
      if (!existsSync(commonJsHeftEntryPoint)) {
        const legacyHeftEntryPoint: string = join(heftFolder, 'lib', 'start.js');
        if (!existsSync(legacyHeftEntryPoint)) {
          throw new Error(
            `Unable to find Heft entry point: ${commonJsHeftEntryPoint} or ${legacyHeftEntryPoint}`
          );
        } else {
          heftEntryPoint = legacyHeftEntryPoint;
        }
      } else {
        heftEntryPoint = commonJsHeftEntryPoint;
      }
    } catch (error) {
      throw new Error('Error probing for local Heft version: ' + (error as Error).message);
    }

    require(heftEntryPoint);

    // We found and successfully invoked the local Heft
    return true;
  }

  // We couldn't find the package folder
  return false;
}

if (!tryStartLocalHeft()) {
  // A project Heft dependency was not found, so launch the unmanaged version.
  require('./start.js');
}
