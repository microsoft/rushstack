// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IDisposable, Utilities } from '../Utilities';

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

describe(Utilities.name, () => {
  describe(Utilities.usingAsync.name, () => {
    let disposed: boolean;

    beforeEach(() => {
      disposed = false;
    });

    class Disposable implements IDisposable {
      public dispose(): void {
        disposed = true;
      }
    }

    it('Disposes correctly in a simple case', async () => {
      await Utilities.usingAsync(
        () => new Disposable(),
        () => {
          /* no-op */
        }
      );

      expect(disposed).toEqual(true);
    });

    it('Disposes correctly after the operation throws an exception', async () => {
      await expect(
        async () =>
          await Utilities.usingAsync(
            () => new Disposable(),
            () => {
              throw new Error('operation threw');
            }
          )
      ).rejects.toMatchSnapshot();

      expect(disposed).toEqual(true);
    });

    it('Does not dispose if the construction throws an exception', async () => {
      await expect(
        async () =>
          await Utilities.usingAsync(
            async () => {
              throw new Error('constructor threw');
            },
            () => {
              /* no-op */
            }
          )
      ).rejects.toMatchSnapshot();

      expect(disposed).toEqual(false);
    });
  });

  describe(Utilities._convertCommandAndArgsToShell.name, () => {
    it('builds a POSIX shell command from a string', () => {
      const result = withComSpec(undefined, () => Utilities._convertCommandAndArgsToShell('npm test', false));

      expect(result).toMatchSnapshot();
    });

    it('builds a Windows shell command from a string', () => {
      const result = withComSpec('cmd.exe', () => Utilities._convertCommandAndArgsToShell('npm test', true));

      expect(result).toMatchSnapshot();
    });

    it('keeps unescaped args when wrapping a POSIX command object', () => {
      const result = withComSpec(undefined, () =>
        Utilities._convertCommandAndArgsToShell({ command: 'foo bar', args: ['baz qux', '--flag'] }, false)
      );

      expect(result).toMatchSnapshot();
    });

    it('keeps unescaped args when wrapping a Windows command object', () => {
      const result = withComSpec('cmd.exe', () =>
        Utilities._convertCommandAndArgsToShell(
          { command: 'weird "cmd"', args: ['space arg', 'quote "arg"'] },
          true
        )
      );

      expect(result).toMatchSnapshot();
    });
  });
});
