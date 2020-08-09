// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import * as child_process from 'child_process';
import * as path from 'path';
import { IpcMessage } from './LauncherTypes';

export class Rundown {
  // Map from required path --> caller path
  private _importedModuleMap: Map<string, string> = new Map();

  private async _spawnLauncherAsync(nodeArgs: string[]): Promise<void> {
    const childProcess: child_process.ChildProcess = child_process.spawn(process.execPath, nodeArgs, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    childProcess.on('message', (message: IpcMessage): void => {
      switch (message.id) {
        case 'trace':
          this._importedModuleMap.set(message.importedModule, message.callingModule);
          break;
        case 'done':
          console.log('DONE');
          break;
        default:
          throw new Error('Unknown IPC message: ' + JSON.stringify(message));
      }
    });

    return new Promise((resolve, reject) => {
      childProcess.on('exit', (code: number | null, signal: string | null): void => {
        if (code !== 0) {
          reject(new Error('Child process terminated with exit code ' + code));
        } else {
          resolve();
        }
      });
    });
  }

  public async invokeAsync(scriptPath: string, args: ReadonlyArray<string>): Promise<void> {
    if (!FileSystem.exists(scriptPath)) {
      throw new Error('The specified script path does not exist: ' + scriptPath);
    }
    const absoluteScriptPath: string = path.resolve(scriptPath);

    // Example process.argv:
    // ["path/to/launcher.js", "path/to/target-script.js", "first-target-arg"]
    const nodeArgs: string[] = [path.join(__dirname, 'launcher.js'), absoluteScriptPath, ...args];

    await this._spawnLauncherAsync(nodeArgs);
  }

  public writeSnapshotReport(): void {
    const reportPath: string = 'rundown.log';

    console.log('Writing ' + reportPath);
    const importedPaths: string[] = [...this._importedModuleMap.keys()];
    importedPaths.sort();

    let data: string = importedPaths.join('\n') + '\n';
    FileSystem.writeFile(reportPath, data);
  }

  public writeInspectReport(traceImports: boolean): void {
    const reportPath: string = 'rundown.log';
    console.log('Writing ' + reportPath);
    const importedPaths: string[] = [...this._importedModuleMap.keys()];
    importedPaths.sort();

    let data: string = '';

    if (traceImports) {
      data = importedPaths.join('\n') + '\n';
    } else {
      for (const importedPath of importedPaths) {
        data += importedPath + '\n';

        let current: string = importedPath;
        let visited: Set<string> = new Set();
        for (;;) {
          const callerPath = this._importedModuleMap.get(current);
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
    }

    FileSystem.writeFile(reportPath, data);
  }
}
