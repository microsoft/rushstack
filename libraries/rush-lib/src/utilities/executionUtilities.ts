// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ICommandAndArgs {
  command: string;
  args: string[];
}

export const IS_WINDOWS: boolean = process.platform === 'win32';

export function convertCommandAndArgsToShell(command: string, isWindows?: boolean): ICommandAndArgs;
export function convertCommandAndArgsToShell(options: ICommandAndArgs, isWindows?: boolean): ICommandAndArgs;
export function convertCommandAndArgsToShell(
  options: ICommandAndArgs | string,
  isWindows: boolean = IS_WINDOWS
): ICommandAndArgs {
  let shellCommand: string;
  let commandFlags: string[];
  if (isWindows) {
    shellCommand = process.env.comspec || 'cmd';
    commandFlags = ['/d', '/s', '/c'];
  } else {
    shellCommand = 'sh';
    commandFlags = ['-c'];
  }

  let commandToRun: string;
  if (typeof options === 'string') {
    commandToRun = options;
  } else {
    const { command, args } = options;
    const normalizedCommand: string = _escapeArgumentIfNeeded(command, isWindows);
    const normalizedArgs: string[] = [];
    for (const arg of args) {
      normalizedArgs.push(_escapeArgumentIfNeeded(arg, isWindows));
    }

    commandToRun = [normalizedCommand, ...args].join(' ');
  }

  return {
    command: shellCommand,
    args: [...commandFlags, commandToRun]
  };
}

function _escapeArgumentIfNeeded(command: string, isWindows: boolean): string {
  if (command.includes(' ')) {
    if (isWindows) {
      // Windows: use double quotes and escape internal double quotes
      return `"${command.replace(/"/g, '""')}"`;
    } else {
      // Unix: use JSON.stringify for proper escaping
      return JSON.stringify(command);
    }
  } else {
    return command;
  }
}
