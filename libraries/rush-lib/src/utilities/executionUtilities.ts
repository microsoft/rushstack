// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const IS_WINDOWS: boolean = process.platform === 'win32';

// The characters that Python's shlex.quote() leaves unquoted.
const POSIX_SAFE_ARGUMENT_REGEXP: RegExp = /^[A-Za-z0-9_@%+=:,./-]+$/;
// Whitespace, and the characters that cmd.exe or the MSVC argument parser treat specially.
const WINDOWS_UNSAFE_ARGUMENT_REGEXP: RegExp = /[\s"&|<>()^]/;
// A run of backslashes, followed by a double quote or the end of the value.
const WINDOWS_BACKSLASHES_BEFORE_QUOTE_REGEXP: RegExp = /(\\*)("|$)/g;

/**
 * Quotes an argument so that the shell that runs a lifecycle command (`sh -c` on POSIX,
 * `cmd.exe /d /s /c` on Windows) passes it to the command as one literal argument.
 * An argument that needs no quoting is returned unchanged.
 *
 * @remarks
 * On Windows, the argument is wrapped in double quotes. An embedded double quote is written as `""`,
 * which keeps cmd.exe's quote state in step with the argument parser's, and the backslashes before it,
 * or before the closing quote, are doubled. cmd.exe still expands `%NAME%` inside double quotes.
 */
export function quoteShellArgumentIfNeeded(argument: string, isWindows: boolean = IS_WINDOWS): string {
  if (isWindows) {
    if (argument && !WINDOWS_UNSAFE_ARGUMENT_REGEXP.test(argument)) {
      return argument;
    }

    const escapedArgument: string = argument.replace(
      WINDOWS_BACKSLASHES_BEFORE_QUOTE_REGEXP,
      (match: string, backslashes: string, quote: string) =>
        `${backslashes}${backslashes}${quote ? '""' : ''}`
    );
    return `"${escapedArgument}"`;
  } else {
    if (POSIX_SAFE_ARGUMENT_REGEXP.test(argument)) {
      return argument;
    }

    return `'${argument.replace(/'/g, `'\\''`)}'`;
  }
}

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
