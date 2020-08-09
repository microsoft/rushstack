// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import moduleApi = require('module');
import * as process from 'process';

import { /* type */ LauncherAction, IIpcTrace, IIpcDone } from './LauncherTypes';

class Launcher {
  public action: LauncherAction = LauncherAction.Inspect;
  public targetScriptPathArg: string = '';
  public reportPath: string = '';
  private _importedModules: Set<unknown> = new Set();
  private _importedModulePaths: Set<string> = new Set();

  public transformArgs(argv: ReadonlyArray<string>): string[] {
    let nodeArg: string;
    let remainderArgs: string[];

    // Example process.argv:
    // ["path/to/node.exe", "path/to/launcher.js", "path/to/target-script.js", "first-target-arg"]
    [nodeArg, , this.targetScriptPathArg, ...remainderArgs] = argv;

    // Example process.argv:
    // ["path/to/node.exe", "path/to/target-script.js", "first-target-arg"]
    return [nodeArg, this.targetScriptPathArg, ...remainderArgs];
  }

  private static _copyProperties(dst: object, src: object): void {
    for (var prop of Object.keys(src)) {
      dst[prop] = src[prop];
    }
  }

  public installHook(): void {
    const realRequire = moduleApi.Module.prototype.require;

    const importedModules: Set<unknown> = this._importedModules; // for closure
    const importedModulePaths: Set<string> = this._importedModulePaths; // for closure

    function hookedRequire(moduleName: string): unknown {
      // NOTE: The "this" pointer is the calling NodeModule, so we rely on closure
      // variable here.
      const callingModuleInfo: NodeModule = this;

      const importedModule: unknown = realRequire.apply(this, arguments);

      if (!importedModules.has(importedModule)) {
        importedModules.add(importedModule);

        // Find the info for the imported module
        let importedModuleInfo: NodeModule | undefined = undefined;
        const children = callingModuleInfo.children || [];
        for (const child of children) {
          if (child.exports === importedModule) {
            importedModuleInfo = child;
            break;
          }
        }

        if (importedModuleInfo === undefined) {
          // It's a built-in module like "os"
        } else {
          if (!importedModuleInfo.filename) {
            throw new Error('Missing filename for ' + moduleName);
          }

          if (!importedModulePaths.has(importedModuleInfo.filename)) {
            importedModulePaths.add(importedModuleInfo.filename);
            process.send!({
              id: 'trace',
              importedModule: importedModuleInfo.filename,
              callingModule: callingModuleInfo.filename
            } as IIpcTrace);
          }
        }
      }

      return importedModule;
    }

    moduleApi.Module.prototype.require = hookedRequire;
    Launcher._copyProperties(hookedRequire, realRequire);

    process.on('exit', () => {
      process.send!({
        id: 'done'
      } as IIpcDone);
    });
  }
}

const launcher: Launcher = new Launcher();

const originalArgv: ReadonlyArray<string> = [...process.argv];
process.argv.length = 0;
process.argv.push(...launcher.transformArgs(originalArgv));

launcher.installHook();

// Start the app
require(launcher.targetScriptPathArg);
