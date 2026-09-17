// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ChildProcess, type SpawnOptions } from 'node:child_process';

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
    it.each(['COMSPEC', 'comspec', 'ComSpec', 'cOmSpEc'])(
      'resolves a plain Windows request environment with %s',
      (name) => {
        expect(
          Utilities._convertCommandAndArgsToShell('echo request', true, { [name]: 'request-cmd.exe' })
        ).toEqual({ command: 'request-cmd.exe', args: ['/d', '/s', '/c', 'echo request'] });
      }
    );

    it('uses the last Windows environment spelling consistently and never leaks the host shell', () => {
      expect(
        Utilities._convertCommandAndArgsToShell('echo request', true, {
          COMSPEC: 'first.exe',
          ComSpec: 'last.exe'
        }).command
      ).toBe('last.exe');
      expect(Utilities._convertCommandAndArgsToShell('echo request', true, {}).command).toBe('cmd.exe');
      expect(Utilities._convertCommandAndArgsToShell('echo request', true, { ComSpec: '' }).command).toBe(
        'cmd.exe'
      );
    });

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

    describe(Utilities.executeLifecycleCommandAsync.name, () => {
      (process.platform === 'win32' ? it : it.skip)(
        'runs with a mixed-case request COMSPEC even when the host shell is invalid',
        async () => {
          const requestShell: string = process.env.COMSPEC!;
          const child: ChildProcess = withComSpec('Z:\\missing-host-shell.exe', () =>
            Utilities.executeLifecycleCommandAsync('echo request-shell', {
              rushConfiguration: undefined,
              workingDirectory: process.cwd(),
              initCwd: process.cwd(),
              handleOutput: true,
              environmentPathOptions: {},
              initialEnvironment: {
                ComSpec: requestShell,
                SystemRoot: process.env.SystemRoot
              }
            })
          );
          let output: string = '';
          child.stdout!.setEncoding('utf8');
          child.stdout!.on('data', (chunk: string) => {
            output += chunk;
          });
          const code: number | null = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', resolve);
          });
          expect(code).toBe(0);
          expect(output.trim()).toBe('request-shell');
        }
      );

      it('passes prepared lifecycle options to the named child-ownership seam', () => {
        const child: ChildProcess = new ChildProcess();
        const spawn = jest
          .fn<ChildProcess, [string, ReadonlyArray<string>, SpawnOptions]>()
          .mockReturnValue(child);
        const result: ChildProcess = Utilities.executeLifecycleCommandAsync('echo request', {
          rushConfiguration: undefined,
          workingDirectory: process.cwd(),
          initCwd: process.cwd(),
          handleOutput: false,
          environmentPathOptions: {},
          initialEnvironment: { ComSpec: 'C:\\Request shell\\cmd.exe', REQUEST_VALUE: 'request' },
          stdio: 'pipe',
          spawn
        });
        expect(result).toBe(child);
        expect(spawn).toHaveBeenCalledTimes(1);
        const [command, args, options] = spawn.mock.calls[0];
        expect(options).toMatchObject({
          cwd: process.cwd(),
          env: { REQUEST_VALUE: 'request', INIT_CWD: process.cwd() },
          stdio: 'pipe'
        });
        if (process.platform === 'win32') {
          expect(command).toBe('"C:\\Request shell\\cmd.exe" /d /s /c echo request');
          expect(args).toEqual([]);
          expect(options.shell).toBe('C:\\Request shell\\cmd.exe');
        } else {
          expect(command).toBe('sh');
          expect(args).toEqual(['-c', 'echo request']);
          expect(options.shell).toBeUndefined();
        }
      });
    });
  });
});
