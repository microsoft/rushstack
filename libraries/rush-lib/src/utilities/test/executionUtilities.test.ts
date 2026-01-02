// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { convertCommandAndArgsToShell } from '../executionUtilities';

function withComSpec<T>(value: string | undefined, callback: () => T): T {
  const originalValue: string | undefined = process.env.comspec;
  try {
    if (value === undefined) {
      delete process.env.comspec;
    } else {
      process.env.comspec = value;
    }

    return callback();
  } finally {
    if (originalValue === undefined) {
      delete process.env.comspec;
    } else {
      process.env.comspec = originalValue;
    }
  }
}

describe(convertCommandAndArgsToShell.name, () => {
  it('builds a POSIX shell command from a string', () => {
    const result = withComSpec(undefined, () => convertCommandAndArgsToShell('npm test', false));

    expect(result).toMatchSnapshot();
  });

  it('builds a Windows shell command from a string', () => {
    const result = withComSpec('cmd.exe', () => convertCommandAndArgsToShell('npm test', true));

    expect(result).toMatchSnapshot();
  });

  it('keeps unescaped args when wrapping a POSIX command object', () => {
    const result = withComSpec(undefined, () =>
      convertCommandAndArgsToShell({ command: 'foo bar', args: ['baz qux', '--flag'] }, false)
    );

    expect(result).toMatchSnapshot();
  });

  it('keeps unescaped args when wrapping a Windows command object', () => {
    const result = withComSpec('cmd.exe', () =>
      convertCommandAndArgsToShell({ command: 'weird "cmd"', args: ['space arg', 'quote "arg"'] }, true)
    );

    expect(result).toMatchSnapshot();
  });
});
