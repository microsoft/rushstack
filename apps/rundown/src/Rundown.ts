// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup, Sort, Text } from '@rushstack/node-core-library';
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import stringArgv from 'string-argv';

import type { IpcMessage } from './LauncherTypes';

export class Rundown {
  // Map from required path --> caller path
  private _importedModuleMap: Map<string, string> = new Map();

  public async invokeAsync(
    scriptPath: string,
    args: string | undefined,
    quiet: boolean,
    ignoreExitCode: boolean
  ): Promise<void> {
    if (!FileSystem.exists(scriptPath)) {
      throw new Error('The specified script path does not exist: ' + scriptPath);
    }
    const absoluteScriptPath: string = path.resolve(scriptPath);

    const expandedArgs: string[] = args === undefined ? [] : stringArgv(args);

    console.log('Starting process: ' + [absoluteScriptPath, ...expandedArgs].join(' '));
    console.log();

    // Example process.argv:
    // ["path/to/launcher.js", "path/to/target-script.js", "first-target-arg"]
    const nodeArgs: string[] = [path.join(__dirname, 'launcher.js'), absoluteScriptPath, ...expandedArgs];

    await this._spawnLauncherAsync(nodeArgs, quiet, ignoreExitCode);

    if (!quiet) {
      console.log();
    }
  }

  public writeSnapshotReport(): void {
    const reportPath: string = 'rundown-snapshot.log';
    console.log('Writing report file: ' + reportPath);

    const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
    const importedPaths: string[] = [...this._importedModuleMap.keys()];
    const importedPackageFolders: Set<string> = new Set();

    for (const importedPath of importedPaths) {
      const importedPackageFolder: string | undefined =
        packageJsonLookup.tryGetPackageFolderFor(importedPath);
      if (importedPackageFolder) {
        if (/[\\/]node_modules[\\/]/i.test(importedPackageFolder)) {
          importedPackageFolders.add(path.basename(importedPackageFolder));
        } else {
          const relativePath: string = path.relative(process.cwd(), importedPackageFolder);
          importedPackageFolders.add(Text.replaceAll(relativePath, '\\', '/'));
        }
      } else {
        // If the importedPath does not belong to an NPM package, then rundown-snapshot.log can ignore it.
        // In other words, treat it the same way as the local project's source files.
      }
    }

    Sort.sortSet(importedPackageFolders);
    const data: string = [...importedPackageFolders].join('\n') + '\n';

    FileSystem.writeFile(reportPath, data);
  }

  public writeInspectReport(traceImports: boolean): void {
    const reportPath: string = 'rundown-inspect.log';
    console.log('Writing report file: ' + reportPath);

    const importedPaths: string[] = [...this._importedModuleMap.keys()];
    importedPaths.sort();

    let data: string = '';

    if (traceImports) {
      for (const importedPath of importedPaths) {
        data += importedPath + '\n';

        let current: string = importedPath;
        const visited: Set<string> = new Set();
        for (;;) {
          const callerPath: string | undefined = this._importedModuleMap.get(current);
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

    FileSystem.writeFile(reportPath, data);
  }

  private async _spawnLauncherAsync(
    nodeArgs: string[],
    quiet: boolean,
    ignoreExitCode: boolean
  ): Promise<void> {
    const childProcess: child_process.ChildProcess = child_process.spawn(process.execPath, nodeArgs, {
      stdio: quiet ? ['inherit', 'ignore', 'ignore', 'ipc'] : ['inherit', 'inherit', 'inherit', 'ipc']
    });

    let completedNormally: boolean = false;

    childProcess.on('message', (message: IpcMessage): void => {
      switch (message.id) {
        case 'trace':
          for (const record of message.records) {
            this._importedModuleMap.set(record.importedModule, record.callingModule);
          }
          break;
        case 'done':
          completedNormally = true;
          break;
        default:
          throw new Error('Unknown IPC message: ' + JSON.stringify(message));
      }
    });

    await new Promise<void>((resolve, reject) => {
      childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null): void => {
        if (signal) {
          reject(new Error('Child process terminated by ' + signal));
        } else if (exitCode !== 0 && !ignoreExitCode) {
          reject(new Error('Child process terminated with exit code ' + exitCode));
        } else if (!completedNormally) {
          reject(new Error('Child process terminated without completing IPC handshake'));
        } else {
          resolve();
        }
      });
    });
  }
}
