// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ICommandAndArgs {
  command: string;
  args: string[];
}

export function convertCommandAndArgsToShell(command: string): ICommandAndArgs;
export function convertCommandAndArgsToShell(options: ICommandAndArgs): ICommandAndArgs;
export function convertCommandAndArgsToShell(options: ICommandAndArgs | string): ICommandAndArgs {
  let shellCommand: string;
  let commandFlags: string[];
  if (process.platform !== 'win32') {
    shellCommand = 'sh';
    commandFlags = ['-c'];
  } else {
    shellCommand = process.env.comspec || 'cmd';
    commandFlags = ['/d', '/s', '/c'];
  }

  let commandToRun: string;
  if (typeof options === 'string') {
    commandToRun = options;
  } else {
    const { command, args } = options;
    commandToRun = [command, ...args].join(' ');
  }

  return {
    command: shellCommand,
    args: [...commandFlags, commandToRun]
  };
}
