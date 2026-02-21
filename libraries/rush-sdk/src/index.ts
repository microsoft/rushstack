// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';

import {
  JsonFile,
  type JsonObject,
  type IPackageJson,
  PackageJsonLookup,
  Executable
} from '@rushstack/node-core-library';
import { Terminal, ConsoleTerminalProvider } from '@rushstack/terminal';
import { RushGlobalFolder } from '@microsoft/rush-lib/lib/api/RushGlobalFolder';

import {
  RUSH_LIB_NAME,
  RUSH_LIB_PATH_ENV_VAR_NAME,
  type RushLibModuleType,
  _require,
  requireRushLibUnderFolderPath,
  tryFindRushJsonLocation,
  sdkContext
} from './helpers.ts';

const verboseEnabled: boolean =
  typeof process !== 'undefined' &&
  (process.env.RUSH_SDK_DEBUG === '1' || process.env._RUSH_SDK_DEBUG === '1');
const terminal: Terminal = new Terminal(
  new ConsoleTerminalProvider({
    verboseEnabled
  })
);

declare const global: typeof globalThis & {
  ___rush___rushLibModule?: RushLibModuleType;
  ___rush___rushLibModuleFromEnvironment?: RushLibModuleType;
  ___rush___rushLibModuleFromRushGlobalFolder?: RushLibModuleType;
  ___rush___rushLibModuleFromInstallAndRunRush?: RushLibModuleType;
};

let errorMessage: string = '';

// SCENARIO 1:  Rush's PluginManager has initialized "rush-sdk" with Rush's own instance of rush-lib.
// The Rush host process will assign "global.___rush___rushLibModule" before loading the plugin.
if (sdkContext.rushLibModule === undefined) {
  sdkContext.rushLibModule =
    global.___rush___rushLibModule ||
    global.___rush___rushLibModuleFromEnvironment ||
    global.___rush___rushLibModuleFromRushGlobalFolder ||
    global.___rush___rushLibModuleFromInstallAndRunRush;
}

// SCENARIO 2:  The project importing "rush-sdk" has installed its own instance of "rush-lib"
// as a package.json dependency.  For example, this is used by the Jest tests for Rush plugins.
if (sdkContext.rushLibModule === undefined) {
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
          sdkContext.rushLibModule = requireRushLibUnderFolderPath(callerPackageFolder);
        } catch (error) {
          // If we fail to resolve it, ignore the error
          terminal.writeVerboseLine(`Failed to load ${RUSH_LIB_NAME} from caller package`);
        }

        // If two different libraries invoke `rush-sdk`, and one of them provides "rush-lib"
        // then the first version to be loaded wins.  We do not support side-by-side instances of "rush-lib".
        if (sdkContext.rushLibModule !== undefined) {
          // to track which scenario is active and how it got initialized.
          global.___rush___rushLibModule = sdkContext.rushLibModule;
          terminal.writeVerboseLine(`Loaded ${RUSH_LIB_NAME} from caller`);
        }
      }
    }
  }
}

// SCENARIO 3: A tool or script has been invoked as a child process by an instance of "rush-lib" and can use the
// version that invoked it. In this case, use process.env._RUSH_LIB_PATH to find "rush-lib".
if (sdkContext.rushLibModule === undefined) {
  const rushLibPath: string | undefined = process.env[RUSH_LIB_PATH_ENV_VAR_NAME];
  if (rushLibPath) {
    terminal.writeVerboseLine(
      `Try to load ${RUSH_LIB_NAME} from process.env.${RUSH_LIB_PATH_ENV_VAR_NAME} from caller package`
    );
    try {
      sdkContext.rushLibModule = _require(rushLibPath);
    } catch (error) {
      // Log this as a warning, since it is unexpected to define an incorrect value of the variable.
      terminal.writeWarningLine(
        `Failed to load ${RUSH_LIB_NAME} via process.env.${RUSH_LIB_PATH_ENV_VAR_NAME}`
      );
    }

    if (sdkContext.rushLibModule !== undefined) {
      // to track which scenario is active and how it got initialized.
      global.___rush___rushLibModuleFromEnvironment = sdkContext.rushLibModule;
      terminal.writeVerboseLine(`Loaded ${RUSH_LIB_NAME} from process.env.${RUSH_LIB_PATH_ENV_VAR_NAME}`);
    }
  }
}

// SCENARIO 4:  A standalone tool or script depends on "rush-sdk", and is meant to be used inside a monorepo folder.
// In this case, we can first load the rush-lib version in rush global folder. If the expected version is not installed,
// using install-run-rush.js to obtain the appropriate rush-lib version for the monorepo.
if (sdkContext.rushLibModule === undefined) {
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

    try {
      terminal.writeVerboseLine(`Try to load ${RUSH_LIB_NAME} from rush global folder`);
      const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();
      // The path needs to keep align with the logic inside RushVersionSelector
      const expectedGlobalRushInstalledFolder: string = `${rushGlobalFolder.nodeSpecificPath}${path.sep}rush-${rushVersion}`;
      terminal.writeVerboseLine(
        `The expected global rush installed folder is "${expectedGlobalRushInstalledFolder}"`
      );
      sdkContext.rushLibModule = requireRushLibUnderFolderPath(expectedGlobalRushInstalledFolder);
    } catch (e) {
      terminal.writeVerboseLine(`Failed to load ${RUSH_LIB_NAME} from rush global folder: ${e.message}`);
    }

    if (sdkContext.rushLibModule !== undefined) {
      // to track which scenario is active and how it got initialized.
      global.___rush___rushLibModuleFromRushGlobalFolder = sdkContext.rushLibModule;
      terminal.writeVerboseLine(`Loaded ${RUSH_LIB_NAME} installed from rush global folder`);
    } else {
      const installRunNodeModuleFolder: string = `${monorepoRoot}/common/temp/install-run/@microsoft+rush@${rushVersion}`;

      try {
        // First, try to load the version of "rush-lib" that was installed by install-run-rush.js
        terminal.writeVerboseLine(`Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush`);
        sdkContext.rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);
      } catch (e1) {
        let installAndRunRushStderrContent: string = '';
        try {
          const installAndRunRushJSPath: string = `${monorepoRoot}/common/scripts/install-run-rush.js`;

          terminal.writeLine('The Rush engine has not been installed yet. Invoking install-run-rush.js...');

          const installAndRunRushProcess: SpawnSyncReturns<string> = Executable.spawnSync(
            'node',
            [installAndRunRushJSPath, '--help'],
            {
              stdio: 'pipe'
            }
          );

          installAndRunRushStderrContent = installAndRunRushProcess.stderr;
          if (installAndRunRushProcess.status !== 0) {
            throw new Error(`The ${RUSH_LIB_NAME} package failed to install`);
          }

          // Retry to load "rush-lib" after install-run-rush run
          terminal.writeVerboseLine(
            `Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush a second time`
          );
          sdkContext.rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);
        } catch (e2) {
          // eslint-disable-next-line no-console
          console.error(`${installAndRunRushStderrContent}`);
          throw new Error(`The ${RUSH_LIB_NAME} package failed to load`);
        }
      }

      if (sdkContext.rushLibModule !== undefined) {
        // to track which scenario is active and how it got initialized.
        global.___rush___rushLibModuleFromInstallAndRunRush = sdkContext.rushLibModule;
        terminal.writeVerboseLine(`Loaded ${RUSH_LIB_NAME} installed by install-run-rush`);
      }
    }
  } catch (e) {
    // no-catch
    errorMessage = (e as Error).message;
  }
}

if (sdkContext.rushLibModule === undefined) {
  // This error indicates that a project is trying to import "@rushstack/rush-sdk", but the Rush engine
  // instance cannot be found.  If you are writing Jest tests for a Rush plugin, add "@microsoft/rush-lib"
  // to the devDependencies for your project.
  // eslint-disable-next-line no-console
  console.error(`Error: The @rushstack/rush-sdk package was not able to load the Rush engine:
${errorMessage}
`);
  process.exit(1);
}

// Based on TypeScript's __exportStar()
for (const property in sdkContext.rushLibModule) {
  if (property !== 'default' && !exports.hasOwnProperty(property)) {
    const rushLibModuleForClosure: RushLibModuleType = sdkContext.rushLibModule;

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
 * Used by the .js stubs for path-based imports of `@microsoft/rush-lib` internal APIs.
 */
export function _rushSdk_loadInternalModule(srcImportPath: string): unknown {
  if (!exports._RushInternals) {
    throw new Error(
      `Rush version ${exports.Rush.version} does not support internal API imports via rush-sdk`
    );
  }
  return exports._RushInternals.loadModule(srcImportPath);
}
