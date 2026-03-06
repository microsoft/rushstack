// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import moduleApi = require('module');
import process from 'node:process';

import { LauncherAction } from './LauncherTypes.ts'; // "import type" doesn't work with const enums
import type { IIpcTrace, IIpcDone, IIpcTraceRecord } from './LauncherTypes.ts';

// The _ipcTraceRecordsBatch will get transmitted when this many items are accumulated
const IPC_BATCH_SIZE: number = 300;

class Launcher {
  public action: LauncherAction = LauncherAction.Inspect;
  public targetScriptPathArg: string = '';
  public reportPath: string = '';
  private _importedModules: Set<unknown> = new Set();
  private _importedModulePaths: Set<string> = new Set();
  private _ipcTraceRecordsBatch: IIpcTraceRecord[] = [];

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static _copyProperties(dst: any, src: any): void {
    for (const prop of Object.keys(src)) {
      dst[prop] = src[prop];
    }
  }

  private _sendIpcTraceBatch(): void {
    if (this._ipcTraceRecordsBatch.length > 0) {
      const batch: IIpcTraceRecord[] = [...this._ipcTraceRecordsBatch];
      this._ipcTraceRecordsBatch.length = 0;

      process.send!({
        id: 'trace',
        records: batch
      } as IIpcTrace);
    }
  }

  public installHook(): void {
    const realRequire: typeof moduleApi.Module.prototype.require = moduleApi.Module.prototype.require;

    const importedModules: Set<unknown> = this._importedModules; // for closure
    const importedModulePaths: Set<string> = this._importedModulePaths; // for closure
    const ipcTraceRecordsBatch: IIpcTraceRecord[] = this._ipcTraceRecordsBatch; // for closure
    const sendIpcTraceBatch: () => void = this._sendIpcTraceBatch.bind(this); // for closure

    function hookedRequire(this: NodeModule, moduleName: string): unknown {
      // NOTE: The "this" pointer is the calling NodeModule, so we rely on closure
      // variable here.
      const callingModuleInfo: NodeModule = this;

      // Paranoidly use "arguments" in case some implementor passes additional undocumented arguments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const importedModule: unknown = (realRequire as any).apply(callingModuleInfo, arguments);

      if (!importedModules.has(importedModule)) {
        importedModules.add(importedModule);

        // Find the info for the imported module
        let importedModuleInfo: NodeModule | undefined = undefined;
        const children: NodeModule[] = callingModuleInfo.children || [];
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
            ipcTraceRecordsBatch.push({
              importedModule: importedModuleInfo.filename,
              callingModule: callingModuleInfo.filename
            });
            if (ipcTraceRecordsBatch.length >= IPC_BATCH_SIZE) {
              sendIpcTraceBatch();
            }
          }
        }
      }

      return importedModule;
    }

    moduleApi.Module.prototype.require = hookedRequire as NodeJS.Require;
    Launcher._copyProperties(hookedRequire, realRequire);

    process.on('exit', () => {
      this._sendIpcTraceBatch();
      process.send!({
        id: 'done'
      } as IIpcDone);
    });
  }
}

if (!process.send) {
  throw new Error('launcher.js must be invoked via IPC');
}

const launcher: Launcher = new Launcher();

const originalArgv: ReadonlyArray<string> = [...process.argv];
process.argv.length = 0;
process.argv.push(...launcher.transformArgs(originalArgv));

launcher.installHook();

// Start the app
require(launcher.targetScriptPathArg);
