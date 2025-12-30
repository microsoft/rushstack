// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ICommandAndArgs {
  command: string;
  args: string[];
}

const IS_WINDOWS: boolean = process.platform === 'win32';

export function convertCommandAndArgsToShell(command: string): ICommandAndArgs;
export function convertCommandAndArgsToShell(options: ICommandAndArgs): ICommandAndArgs;
export function convertCommandAndArgsToShell(options: ICommandAndArgs | string): ICommandAndArgs {
  let shellCommand: string;
  let commandFlags: string[];
  if (IS_WINDOWS) {
    shellCommand = process.env.comspec || 'cmd';
    commandFlags = ['/d', '/s', '/c'];
  } else {
    shellCommand = 'sh';
    commandFlags = ['-c'];
  }

  let commandToRun: string;
  if (typeof options === 'string') {
    commandToRun = _escapeArgumentIfNeeded(options);
  } else {
    const { command, args } = options;
    const normalizedCommand: string = _escapeArgumentIfNeeded(command);
    const normalizedArgs: string[] = [];
    for (const arg of args) {
      normalizedArgs.push(_escapeArgumentIfNeeded(arg));
    }

    commandToRun = [normalizedCommand, ...args].join(' ');
  }

  return {
    command: shellCommand,
    args: [...commandFlags, commandToRun]
  };
}

function _escapeArgumentIfNeeded(command: string): string {
  if (command.includes(' ')) {
    if (IS_WINDOWS) {
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
