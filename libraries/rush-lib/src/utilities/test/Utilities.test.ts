// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import { type IDisposable, Utilities } from '../Utilities';
import { getNpmrcEnvironmentVariables, syncNpmrc } from '../npmrcUtilities';
import { IS_WINDOWS } from '../executionUtilities';

const PACKAGE_ROOT: string = path.resolve(__dirname, '../../..');
const TEST_TEMP_FOLDER: string = `${PACKAGE_ROOT}/temp/utilities-credential-environment-test`;

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
  describe('package manager credential environment', () => {
    const credentialKey: string = 'npm_config_//registry.example.test/npm/:_authToken';
    const credentialValue: string = 'non-secret-test-token';
    const scriptPath: string = `${TEST_TEMP_FOLDER}/check credentials.cjs`;
    let environment: NodeJS.ProcessEnv;

    beforeAll(async () => {
      await FileSystem.deleteFolderAsync(TEST_TEMP_FOLDER);
      const sourceFolder: string = `${TEST_TEMP_FOLDER}/source`;
      const targetFolder: string = `${TEST_TEMP_FOLDER}/target`;
      await FileSystem.writeFileAsync(
        `${sourceFolder}/.npmrc`,
        '//registry.example.test/npm/:_authToken=${RUSH_TEST_TOKEN}\n',
        { ensureFolderExists: true }
      );
      const sourceEnvironment: NodeJS.ProcessEnv = { RUSH_TEST_TOKEN: credentialValue };
      syncNpmrc({
        sourceNpmrcFolder: sourceFolder,
        targetNpmrcFolder: targetFolder,
        supportEnvVarFallbackSyntax: true,
        moveSensitiveSettingsToEnvironment: true,
        env: sourceEnvironment
      });
      environment = {
        ...process.env,
        ...getNpmrcEnvironmentVariables({
          npmrcFolder: targetFolder,
          supportEnvVarFallbackSyntax: true,
          env: sourceEnvironment
        })
      };
      await FileSystem.writeFileAsync(
        scriptPath,
        [
          `if (process.env[${JSON.stringify(credentialKey)}] !== ${JSON.stringify(credentialValue)}) {`,
          '  process.exit(42);',
          '}',
          'process.stdout.write(JSON.stringify(process.argv.slice(2)));'
        ].join('\n'),
        { ensureFolderExists: true }
      );
      expect(await FileSystem.readFileAsync(`${targetFolder}/.npmrc`)).not.toContain(credentialValue);
    });

    afterAll(async () => {
      await FileSystem.deleteFolderAsync(TEST_TEMP_FOLDER);
    });

    it('preserves generated credentials through the captured subprocess path', async () => {
      const output: string = await Utilities.executeCommandAndCaptureOutputAsync({
        command: process.execPath,
        args: [scriptPath, 'space argument'],
        workingDirectory: TEST_TEMP_FOLDER,
        environment,
        keepEnvironment: true,
        useShell: false
      });
      expect(JSON.parse(output)).toEqual(['space argument']);
    });

    it('preserves generated credentials through the install retry path', async () => {
      await Utilities.executeCommandWithRetryAsync(
        {
          command: process.execPath,
          args: [scriptPath],
          workingDirectory: TEST_TEMP_FOLDER,
          environment,
          keepEnvironment: true,
          useShell: false,
          suppressOutput: true
        },
        1
      );
    });

    (IS_WINDOWS ? it.skip : it)(
      'passes POSIX arguments without shell expansion or pre-escaping',
      async () => {
        const args: string[] = [
          '',
          'two words',
          '"quoted"',
          "single'quote",
          '$HOME',
          '$(echo expanded)',
          '*'
        ];
        const output: string = await Utilities.executeCommandAndCaptureOutputAsync({
          command: process.execPath,
          args: [scriptPath, ...args],
          workingDirectory: TEST_TEMP_FOLDER,
          environment,
          keepEnvironment: true,
          useShell: false
        });
        expect(JSON.parse(output)).toEqual(args);
      }
    );

    it('retains exit-code capture for failed direct subprocesses', async () => {
      const { exitCode } = await Utilities.executeCommandAsync({
        command: process.execPath,
        args: [scriptPath],
        workingDirectory: TEST_TEMP_FOLDER,
        environment: { ...environment, [credentialKey]: 'wrong-test-token' },
        keepEnvironment: true,
        useShell: false,
        captureExitCodeAndSignal: true,
        suppressOutput: true
      });
      expect(exitCode).toBe(42);
    });

    it('still rejects failed direct subprocesses by default', async () => {
      await expect(
        Utilities.executeCommandAsync({
          command: process.execPath,
          args: [scriptPath],
          workingDirectory: TEST_TEMP_FOLDER,
          environment: { ...environment, [credentialKey]: 'wrong-test-token' },
          keepEnvironment: true,
          useShell: false,
          suppressOutput: true
        })
      ).rejects.toThrow();
    });

    it('retains shell execution by default', async () => {
      const output: string = await Utilities.executeCommandAndCaptureOutputAsync({
        command: 'echo',
        args: ['first', '&&', 'echo', 'second'],
        workingDirectory: TEST_TEMP_FOLDER
      });
      expect(
        output
          .trim()
          .split(/\r?\n/)
          .map((line) => line.trim())
      ).toEqual(['first', 'second']);
    });
  });

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
