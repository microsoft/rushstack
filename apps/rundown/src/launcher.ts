// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import moduleApi = require('module');
import * as process from 'process';
import * as fs from 'fs';

import { /* type */ LauncherAction } from './LauncherAction';

class Launcher {
  public action: LauncherAction = LauncherAction.Inspect;
  public targetScriptPathArg: string = '';
  public reportPath: string = '';
  private _importedModules: Set<unknown> = new Set();

  public transformArgs(argv: ReadonlyArray<string>): string[] {
    let nodeArg: string;
    let actionArg: string;
    let remainderArgs: string[];

    // Example process.argv:
    // ["path/to/node.exe", "path/to/launcher.js", "snapshot", "rundown.log", "path/to/target-script.js", "first-target-arg"]
    [
      nodeArg /* launcher.js */,
      ,
      actionArg,
      this.reportPath,
      this.targetScriptPathArg,
      ...remainderArgs
    ] = argv;

    // Extract the caller ("0" or "1")
    this.action = actionArg as LauncherAction;

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
    // Map from required path --> caller path
    const importedModuleMap: Map<string, string> = new Map();

    const realRequire = moduleApi.Module.prototype.require;

    const importedModules: Set<unknown> = this._importedModules; // for closure

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

          if (!importedModuleMap.has(importedModuleInfo.filename)) {
            importedModuleMap.set(importedModuleInfo.filename, callingModuleInfo.filename);
          }
        }
      }

      return importedModule;
    }

    moduleApi.Module.prototype.require = hookedRequire;
    Launcher._copyProperties(hookedRequire, realRequire);

    process.on('exit', () => {
      console.log('Writing ' + this.reportPath);
      const importedPaths = [...importedModuleMap.keys()];
      importedPaths.sort();

      let data: string = '';

      if (this.action === LauncherAction.Inspect) {
        for (const importedPath of importedPaths) {
          data += importedPath + '\n';

          let current: string = importedPath;
          let visited: Set<string> = new Set();
          for (;;) {
            const callerPath = importedModuleMap.get(current);
            if (!callerPath) {
              break;
            }
            if (visited.has(callerPath)) {
              break;
            }
            visited.add(callerPath);
            data += '  imported by ' + callerPath + '\n';
            current = callerPath;
          }
          data += '\n';
        }
      } else {
        data = importedPaths.join('\n') + '\n';
      }

      fs.writeFileSync(this.reportPath, data);
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
