// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import type { IOperationRunner, IOperationRunnerContext } from '@rushstack/rush-sdk';
import type { IDependencyMetadata } from '../types';
import { OperationStatus, Utilities } from '../externals';

const isWindows: boolean = process.platform === 'win32';
const gitBinary: string = process.env.RUSH_GIT_BINARY_PATH || 'git';

/**
 * Runner that links bins, applies pnpm patches, and runs install scripts for a package.
 * This should be able to be replaced with existing code in the package manager itself.
 * That said, profile to check for bottlenecks.
 */
export class InstallOperationRunner implements IOperationRunner {
  public readonly name: string;
  // Reporting timing here would be very noisy in the general case
  public readonly reportTiming: boolean;
  public silent: boolean;
  // Has side effects
  public isSkipAllowed: boolean = false;
  // Doesn't block cache writes
  public isCacheWriteAllowed: boolean = true;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public readonly data: IDependencyMetadata;

  public constructor(name: string, metadata: IDependencyMetadata) {
    this.name = name;
    this.data = metadata;
    this.silent = this.reportTiming = !metadata.requiresBuild && !metadata.patchPath;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { data } = this;

    try {
      // Link bins
      let bins: Map<string, string> | undefined;
      for (const dep of data.deps.values()) {
        if (dep.hasBin) {
          if (!bins) {
            bins = new Map();
          }
          for (const [name, localPath] of Object.entries(dep.hasBin)) {
            bins.set(name, resolvePath(dep.targetFolder, localPath));
          }
        }
      }

      const binDir: string = `${data.originFolder}/.bin`;

      if (bins) {
        await fs.promises.mkdir(binDir, { recursive: true });
        await Promise.all(
          Array.from(bins, async ([key, resolvedPath]) => {
            const filePath: string = isWindows ? resolvePath(binDir, `${key}.CMD`) : `${binDir}/${key}`;
            const content: Buffer = Buffer.from(
              isWindows
                ? `@SETLOCAL\r\n@SET PATHEXT=%PATHEXT:;.JS;=;%\r\nnode "${resolvedPath}" %*\r\n`
                : `#!/bin/sh\nexec node "${resolvedPath}" "$@"\n`,
              'utf8'
            );
            await fs.promises.writeFile(filePath, content, {
              mode: 0o777,
              flag: 'w'
            });
          })
        );
      }

      const { requiresBuild, targetFolder, patchPath } = data;
      if (patchPath) {
        const { terminal } = context.collatedWriter;

        async function patchPackage(patchToApply: string): Promise<OperationStatus> {
          const rawPatch: string = await fs.promises.readFile(patchToApply, 'utf-8');
          // The patch saved on disk doesn't match the format required by Git.
          // All context newlines need a trailing space, and the file needs a trailing newline.
          // core.autocrlf is likely a culprit here. May need to configure the patch files in .gitattributes
          const correctedPatch: string = `${rawPatch.replace(/\r\n/g, '\n').replace(/\n\n/g, '\n \n')}\n`;
          terminal.writeStdoutLine(`Patching ${targetFolder}`);
          const subProcess: ChildProcess = spawn(
            gitBinary,
            ['--no-optional-locks', '--bare', 'apply', '--verbose', '-'],
            {
              cwd: targetFolder,
              shell: false,
              env: process.env,
              stdio: ['pipe', 'pipe', 'pipe']
            }
          );

          subProcess.stdout!.on('data', (chunk: string) => {
            terminal.writeStdoutLine(chunk);
          });
          subProcess.stderr!.on('data', (chunk: string) => {
            terminal.writeStdoutLine(chunk);
          });

          subProcess.stdin!.end(correctedPatch, 'utf-8');

          return await new Promise(
            (resolve: (status: OperationStatus) => void, reject: (error: Error) => void) => {
              subProcess.on('close', (code: number) => {
                try {
                  if (code !== 0) {
                    reject(new Error(`Returned error code: ${code}`));
                  } else {
                    resolve(OperationStatus.Success);
                  }
                } catch (error) {
                  reject(error);
                }
              });
            }
          );
        }

        const status: OperationStatus = await patchPackage(patchPath);

        if (status !== OperationStatus.Success) {
          return status;
        } else {
          terminal.writeStdoutLine(`Patched.`);
        }
      }

      if (Array.isArray(requiresBuild)) {
        const { terminal } = context.collatedWriter;
        async function runScript(script: string): Promise<OperationStatus> {
          const output: string[] = [];
          terminal.writeStdoutLine(`Running ${script} in ${targetFolder}`);
          const subProcess: ChildProcess = Utilities.executeLifecycleCommandAsync(script, {
            rushConfiguration: undefined,
            workingDirectory: targetFolder,
            initCwd: targetFolder,
            handleOutput: true,
            environmentPathOptions: {
              additionalPathFolders: [binDir]
            }
          });

          subProcess.stdout?.on('data', (chunk: string) => {
            output.push(chunk.toString());
          });
          subProcess.stderr?.on('data', (chunk: string) => {
            output.push(chunk.toString());
          });

          const status: OperationStatus = await new Promise(
            (resolve: (status: OperationStatus) => void, reject: (error: Error) => void) => {
              subProcess.on('close', (code: number) => {
                try {
                  if (code !== 0) {
                    reject(new Error(`Returned error code: ${code}:\n${output.join('')}`));
                  } else {
                    resolve(OperationStatus.Success);
                  }
                } catch (error) {
                  reject(error);
                }
              });
            }
          );

          return status;
        }

        for (const script of requiresBuild) {
          const status: OperationStatus = await runScript(script);
          if (status !== OperationStatus.Success) {
            return status;
          }
        }
      }
      return OperationStatus.Success;
    } catch (err) {
      context.collatedWriter.terminal.writeStderrLine(
        `Install "${this.data.targetFolder}" failed with: ${err.toString()}`
      );
      this.silent = false;
      return OperationStatus.Failure;
    }
  }
}
