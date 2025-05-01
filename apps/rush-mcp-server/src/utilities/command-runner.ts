// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'child_process';
import { Executable, type IExecutableSpawnSyncOptions } from '@rushstack/node-core-library';

interface ICommandResult {
  status: number;
  stdout: string;
  stderr: string;
  command: string;
  args: string[];
}

export class CommandExecutionError extends Error {
  public constructor(command: string, args: string[], stderr: string, status: number) {
    super(`Command "${command} ${args.join(' ')}" failed with status ${status}:\n${stderr}`);
    this.name = 'CommandExecutionError';
  }
}

export class CommandRunner {
  private static readonly _commandCache: Map<string, string | null> = new Map();

  private static _resolveCommand(command: string): string {
    const cachedPath: string | null | undefined = this._commandCache.get(command);
    if (cachedPath === null) {
      throw new Error(`Command "${command}" not found in system PATH`);
    }

    if (cachedPath) {
      return cachedPath;
    }

    const resolvedPath: string | null = Executable.tryResolve(command) ?? null;
    this._commandCache.set(command, resolvedPath);

    if (!resolvedPath) {
      throw new Error(`Command "${command}" not found in system PATH`);
    }

    return resolvedPath;
  }

  private static async _executeCommandAsync(
    command: string,
    args: string[],
    options?: IExecutableSpawnSyncOptions
  ): Promise<ICommandResult> {
    const commandPath: string = this._resolveCommand(command);

    const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(commandPath, args, options);

    const status: number = result.status ?? 1;

    if (status !== 0) {
      throw new CommandExecutionError(command, args, result.stderr, status);
    }

    return {
      status,
      stdout: result.stdout,
      stderr: result.stderr,
      command,
      args
    };
  }

  public static async runRushCommandAsync(
    args: string[],
    options?: IExecutableSpawnSyncOptions
  ): Promise<ICommandResult> {
    return this._executeCommandAsync('rush', args, options);
  }

  public static async runRushXCommandAsync(
    args: string[],
    options?: IExecutableSpawnSyncOptions
  ): Promise<ICommandResult> {
    return this._executeCommandAsync('rushx', args, options);
  }

  public static async runGitCommandAsync(
    args: string[],
    options?: IExecutableSpawnSyncOptions
  ): Promise<ICommandResult> {
    return this._executeCommandAsync('git', args, options);
  }
}
