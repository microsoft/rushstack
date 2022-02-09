// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  JsonObject,
  Import,
  IPackageJson,
  PackageJsonLookup,
  Executable,
  FileSystem,
  Terminal,
  ConsoleTerminalProvider
} from '@rushstack/node-core-library';
import type { SpawnSyncReturns } from 'child_process';

const RUSH_LIB_NAME: string = '@microsoft/rush-lib';

const verboseEnabled: boolean = typeof process !== 'undefined' && process.env.RUSH_SDK_DEBUG === '1';
const terminal: Terminal = new Terminal(
  new ConsoleTerminalProvider({
    verboseEnabled
  })
);

type RushLibModuleType = Record<string, unknown>;
declare const global: NodeJS.Global &
  typeof globalThis & {
    ___rush___rushLibModule?: RushLibModuleType;
    ___rush___rushLibModuleFromInstallAndRunRush?: RushLibModuleType;
  };

function _require<TResult>(moduleName: string): TResult {
  if (typeof __non_webpack_require__ === 'function') {
    // If this library has been bundled with Webpack, we need to call the real `require` function
    // that doesn't get turned into a `__webpack_require__` statement.
    // `__non_webpack_require__` is a Webpack macro that gets turned into a `require` statement
    // during bundling.
    return __non_webpack_require__(moduleName);
  } else {
    return require(moduleName);
  }
}

// SCENARIO 1:  Rush's PluginManager has initialized "rush-sdk" with Rush's own instance of rush-lib.
// The Rush host process will assign "global.___rush___rushLibModule" before loading the plugin.
let rushLibModule: RushLibModuleType | undefined =
  global.___rush___rushLibModule || global.___rush___rushLibModuleFromInstallAndRunRush;
let errorMessage: string = '';

// SCENARIO 2:  The project importing "rush-sdk" has installed its own instance of "rush-lib"
// as a package.json dependency.  For example, this is used by the Jest tests for Rush plugins.
if (rushLibModule === undefined) {
  const importingPath: string | null | undefined = module?.parent?.filename;
  if (importingPath) {
    const callerPackageFolder: string | undefined =
      PackageJsonLookup.instance.tryGetPackageFolderFor(importingPath);

    if (callerPackageFolder !== undefined) {
      const callerPackageJson: IPackageJson = _require(path.join(callerPackageFolder, 'package.json'));

      // Does the caller properly declare a dependency on rush-lib?
      if (
        (callerPackageJson.dependencies && callerPackageJson.dependencies[RUSH_LIB_NAME] !== undefined) ||
        (callerPackageJson.devDependencies &&
          callerPackageJson.devDependencies[RUSH_LIB_NAME] !== undefined) ||
        (callerPackageJson.peerDependencies &&
          callerPackageJson.peerDependencies[RUSH_LIB_NAME] !== undefined)
      ) {
        // Try to resolve rush-lib from the caller's folder
        terminal.writeVerboseLine(`Try to load ${RUSH_LIB_NAME} from caller package`);
        try {
          rushLibModule = requireRushLibUnderFolderPath(callerPackageFolder);
        } catch (error) {
          // If we fail to resolve it, ignore the error
          terminal.writeVerboseLine(`Failed to load ${RUSH_LIB_NAME} from caller package`);
        }

        // If two different libraries invoke `rush-sdk`, and one of them provides "rush-lib"
        // then the first version to be loaded wins.  We do not support side-by-side instances of "rush-lib".
        if (rushLibModule !== undefined) {
          // to track which scenario is active and how it got initialized.
          global.___rush___rushLibModule = rushLibModule;
          terminal.writeVerboseLine(`Loaded ${RUSH_LIB_NAME} from caller`);
        }
      }
    }
  }
}

// SCENARIO 3:  A tool or script depends on "rush-sdk", and is meant to be used inside a monorepo folder.
// In this case, we can use install-run-rush.js to obtain the appropriate rush-lib version for the monorepo.
if (rushLibModule === undefined) {
  try {
    const rushJsonPath: string | undefined = tryFindRushJsonLocation(process.cwd());
    if (!rushJsonPath) {
      throw new Error(
        'Unable to find rush.json in the current folder or its parent folders.\n' +
          'This tool is meant to be invoked from a working directory inside a Rush repository.'
      );
    }
    const monorepoRoot: string = path.dirname(rushJsonPath);

    const rushJson: JsonObject = JsonFile.load(rushJsonPath);
    const { rushVersion } = rushJson;

    const installRunNodeModuleFolder: string = path.join(
      monorepoRoot,
      `common/temp/install-run/@microsoft+rush@${rushVersion}`
    );

    try {
      // First, try to load the version of "rush-lib" that was installed by install-run-rush.js
      terminal.writeVerboseLine(`Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush`);
      rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);
    } catch (e) {
      let installAndRunRushStderrContent: string = '';
      try {
        const installAndRunRushJSPath: string = path.join(monorepoRoot, 'common/scripts/install-run-rush.js');

        terminal.writeLine('The Rush engine has not been installed yet. Invoking install-run-rush.js...');

        const installAndRuhRushProcess: SpawnSyncReturns<string> = Executable.spawnSync(
          'node',
          [installAndRunRushJSPath, '--help'],
          {
            stdio: 'pipe'
          }
        );

        installAndRunRushStderrContent = installAndRuhRushProcess.stderr;
        if (installAndRuhRushProcess.status !== 0) {
          throw new Error(`The ${RUSH_LIB_NAME} package failed to install`);
        }

        // Retry to load "rush-lib" after install-run-rush run
        terminal.writeVerboseLine(
          `Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush a second time`
        );
        rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);
      } catch (e) {
        console.error(`${installAndRunRushStderrContent}`);
        throw new Error(`The ${RUSH_LIB_NAME} package failed to load`);
      }
    }

    if (rushLibModule !== undefined) {
      // to track which scenario is active and how it got initialized.
      global.___rush___rushLibModuleFromInstallAndRunRush = rushLibModule;
      terminal.writeVerboseLine(`Loaded ${RUSH_LIB_NAME} installed by install-run-rush`);
    }
  } catch (e) {
    // no-catch
    errorMessage = (e as Error).message;
  }
}

if (rushLibModule === undefined) {
  // This error indicates that a project is trying to import "@rushstack/rush-sdk", but the Rush engine
  // instance cannot be found.  If you are writing Jest tests for a Rush plugin, add "@microsoft/rush-lib"
  // to the devDependencies for your project.
  console.error(`Error: The @rushstack/rush-sdk package was not able to load the Rush engine:
${errorMessage}
`);
  process.exit(1);
}

// Based on TypeScript's __exportStar()
for (const property in rushLibModule) {
  if (property !== 'default' && !exports.hasOwnProperty(property)) {
    const rushLibModuleForClosure: RushLibModuleType = rushLibModule;

    // Based on TypeScript's __createBinding()
    Object.defineProperty(exports, property, {
      enumerable: true,
      get: function () {
        return rushLibModuleForClosure[property];
      }
    });
  }
}

/**
 * Require `@microsoft/rush-lib` under the specified folder path.
 */
function requireRushLibUnderFolderPath(folderPath: string): RushLibModuleType {
  const rushLibModulePath: string = Import.resolveModule({
    modulePath: RUSH_LIB_NAME,
    baseFolderPath: folderPath
  });

  return _require(rushLibModulePath);
}

/**
 * Find the rush.json location and return the path, or undefined if a rush.json can't be found.
 *
 * @privateRemarks
 * Keep this in sync with `RushConfiguration.tryFindRushJsonLocation`.
 */
function tryFindRushJsonLocation(startingFolder: string): string | undefined {
  let currentFolder: string = startingFolder;

  // Look upwards at parent folders until we find a folder containing rush.json
  for (let i: number = 0; i < 10; ++i) {
    const rushJsonFilename: string = path.join(currentFolder, 'rush.json');

    if (FileSystem.exists(rushJsonFilename)) {
      return rushJsonFilename;
    }

    const parentFolder: string = path.dirname(currentFolder);
    if (parentFolder === currentFolder) {
      break;
    }

    currentFolder = parentFolder;
  }

  return undefined;
}
