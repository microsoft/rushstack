// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  StringBufferTerminalProvider,
  Terminal,
  type ITerminal,
  type ITerminalProvider
} from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { Utilities } from '../../../utilities/Utilities';
import type { IOperationRunnerContext } from '../IOperationRunner';
import type { IOperationChildProcessReporter } from '../OperationEventSink';
import { HeftChildReporterNonFatalError } from '../HeftChildProcessReporter';
import { OperationStatus } from '../OperationStatus';
import { ShellOperationRunner, convertSlashesForWindows, isHeftCommand } from '../ShellOperationRunner';

describe(convertSlashesForWindows.name, () => {
  it('converted inputs', () => {
    expect(convertSlashesForWindows('./node_modules/.bin/tslint -c config/tslint.json')).toEqual(
      '.\\node_modules\\.bin\\tslint -c config/tslint.json'
    );
    expect(convertSlashesForWindows('/blah/bleep&&/bloop')).toEqual('\\blah\\bleep&&/bloop');
    expect(convertSlashesForWindows('/blah/bleep')).toEqual('\\blah\\bleep');
    expect(convertSlashesForWindows('/blah/bleep --path a/b')).toEqual('\\blah\\bleep --path a/b');
    expect(convertSlashesForWindows('/blah/bleep>output.log')).toEqual('\\blah\\bleep>output.log');
    expect(convertSlashesForWindows('/blah/bleep<input.json')).toEqual('\\blah\\bleep<input.json');
    expect(convertSlashesForWindows('/blah/bleep|/blah/bloop')).toEqual('\\blah\\bleep|/blah/bloop');
  });

  describe(isHeftCommand.name, () => {
    it.each([
      ['heft run --only build', true],
      ['./node_modules/.bin/heft build', true],
      ['node ./node_modules/@rushstack/heft/bin/heft build', true],
      ['"C:\\repo\\node_modules\\.bin\\heft.cmd" build', true],
      ['heft build --message "safe && quoted"', true],
      ['eslint .', false],
      ['node scripts/build.js', false],
      ['cross-env NODE_ENV=test heft build', false],
      ['heft build && node spawn-grandchild.js', false],
      ['heft build $(node spawn-grandchild.js)', false],
      ['heft build &', false],
      ['heft build > output.log', false],
      ['heft build `node spawn-grandchild.js`', false],
      ['heft build "$(node spawn-grandchild.js)"', false],
      ['heft build "`node spawn-grandchild.js`"', false],
      ["heft build '$(literal)'", true],
      ['heft build "unterminated', false]
    ])('classifies %s', (command: string, expected: boolean) => {
      expect(isHeftCommand(command)).toBe(expected);
    });

    it('does not allocate Unix reporter pipes for a shell child that can spawn a grandchild', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const stdout: PassThrough = new PassThrough();
      const stderr: PassThrough = new PassThrough();
      const child: childProcess.ChildProcess = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        stdio: []
      }) as unknown as childProcess.ChildProcess;
      const executeSpy = jest
        .spyOn(Utilities, 'executeLifecycleCommandAsync')
        .mockImplementation((command, options) => {
          expect(command).toBe('node spawn-grandchild.js');
          expect(options.additionalEnvironment).toBeUndefined();
          expect(options.stdio).toBeUndefined();
          queueMicrotask(() => {
            stdout.end();
            stderr.end();
            child.emit('close', 0, null);
          });
          return child;
        });
      const createChildProcessReporter = jest.fn();
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
      const context = {
        environment: undefined,
        createChildProcessReporter,
        async runWithTerminalAsync<T>(
          callback: (
            terminal: ITerminal,
            operationTerminalProvider: ITerminalProvider,
            structuredChildOutputTerminalProvider: ITerminalProvider
          ) => Promise<T>
        ): Promise<T> {
          return await callback(new Terminal(terminalProvider), terminalProvider, terminalProvider);
        }
      } as unknown as IOperationRunnerContext;
      const runner: ShellOperationRunner = new ShellOperationRunner({
        phase: { allowWarningsOnSuccess: false } as IPhase,
        rushProject: {
          projectFolder: process.cwd(),
          rushConfiguration: { commonTempFolder: process.cwd() }
        } as RushConfigurationProject,
        displayName: 'grandchild retention',
        initialCommand: 'node spawn-grandchild.js',
        incrementalCommand: undefined,
        commandForHash: 'node spawn-grandchild.js',
        ignoredParameterValues: []
      });

      try {
        await expect(runner.executeAsync(context)).resolves.toBe(OperationStatus.Success);
        expect(createChildProcessReporter).not.toHaveBeenCalled();
      } finally {
        executeSpy.mockRestore();
      }
    });

    it('does not fail a successful Heft operation for a nonfatal acknowledgement error', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const stdout: PassThrough = new PassThrough();
      const stderr: PassThrough = new PassThrough();
      const child: childProcess.ChildProcess = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        stdio: []
      }) as unknown as childProcess.ChildProcess;
      const executeSpy = jest.spyOn(Utilities, 'executeLifecycleCommandAsync').mockImplementation(() => {
        queueMicrotask(() => {
          stdout.end();
          stderr.end();
          child.emit('close', 0, null);
        });
        return child;
      });
      const childReporter: IOperationChildProcessReporter = {
        environment: {},
        hasWarningOrError: false,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
        attachAsync: async () => {
          throw new HeftChildReporterNonFatalError('acknowledgement failed');
        }
      };
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
      const context = {
        environment: undefined,
        error: undefined,
        createChildProcessReporter: () => childReporter,
        async runWithTerminalAsync<T>(
          callback: (
            terminal: ITerminal,
            operationTerminalProvider: ITerminalProvider,
            structuredChildOutputTerminalProvider: ITerminalProvider
          ) => Promise<T>
        ): Promise<T> {
          return await callback(new Terminal(terminalProvider), terminalProvider, terminalProvider);
        }
      } as unknown as IOperationRunnerContext;
      const runner: ShellOperationRunner = new ShellOperationRunner({
        phase: { allowWarningsOnSuccess: false } as IPhase,
        rushProject: {
          projectFolder: process.cwd(),
          rushConfiguration: { commonTempFolder: process.cwd() }
        } as RushConfigurationProject,
        displayName: 'nonfatal reporter error',
        initialCommand: 'heft build',
        incrementalCommand: undefined,
        commandForHash: 'heft build',
        ignoredParameterValues: []
      });

      try {
        await expect(runner.executeAsync(context)).resolves.toBe(OperationStatus.Success);
        expect(context.error).toBeUndefined();
      } finally {
        executeSpy.mockRestore();
      }
    });
  });
  it('ignored inputs', () => {
    expect(convertSlashesForWindows('/blah\\bleep && /bloop')).toEqual('/blah\\bleep && /bloop');
    expect(convertSlashesForWindows('cmd.exe /c blah')).toEqual('cmd.exe /c blah');
    expect(convertSlashesForWindows('"/blah/bleep"')).toEqual('"/blah/bleep"');
  });
});
