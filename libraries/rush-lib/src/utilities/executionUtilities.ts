// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const IS_WINDOWS: boolean = process.platform === 'win32';

export function escapeArgumentIfNeeded(command: string, isWindows: boolean = IS_WINDOWS): string {
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
