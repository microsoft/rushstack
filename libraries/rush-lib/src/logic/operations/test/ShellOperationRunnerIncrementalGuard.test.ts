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
import { OperationStatus } from '../OperationStatus';
import { ShellOperationRunner } from '../ShellOperationRunner';
import {
  getCommandExecution,
  setIncrementalExecutionGuard,
  type IIncrementalExecutionGuard
} from '../IncrementalExecutionState';

const INITIAL_COMMAND: string = 'node build.js';
const INCREMENTAL_COMMAND: string = 'node build.js --incremental';

interface ITestRun {
  readonly status: OperationStatus;
  readonly commands: ReadonlyArray<string>;
  readonly output: string;
  readonly context: IOperationRunnerContext;
}

interface ITestRunOptions {
  readonly requiresGuard: boolean;
  readonly guard?: IIncrementalExecutionGuard;
  readonly hasLastState?: boolean;
  readonly exitCodeByCommand?: Readonly<Record<string, number>>;
}

async function runAsync(options: ITestRunOptions): Promise<ITestRun> {
  const { requiresGuard, guard, hasLastState = true, exitCodeByCommand = {} } = options;
  const commands: string[] = [];
  const executeSpy: jest.SpyInstance = jest
    .spyOn(Utilities, 'executeLifecycleCommandAsync')
    .mockImplementation((command: string) => {
      commands.push(command);
      const stdout: PassThrough = new PassThrough();
      const stderr: PassThrough = new PassThrough();
      const child: childProcess.ChildProcess = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        stdio: []
      }) as unknown as childProcess.ChildProcess;
      queueMicrotask(() => {
        stdout.end();
        stderr.end();
        child.emit('close', exitCodeByCommand[command] ?? 0, null);
      });
      return child;
    });
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const context: IOperationRunnerContext = {
    environment: undefined,
    createChildProcessReporter: jest.fn(),
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
  if (guard) {
    setIncrementalExecutionGuard(context, guard);
  }
  const runner: ShellOperationRunner = new ShellOperationRunner({
    phase: { allowWarningsOnSuccess: false } as IPhase,
    rushProject: {
      projectFolder: process.cwd(),
      rushConfiguration: { commonTempFolder: process.cwd() }
    } as RushConfigurationProject,
    displayName: 'a (build)',
    initialCommand: INITIAL_COMMAND,
    incrementalCommand: INCREMENTAL_COMMAND,
    incrementalCommandRequiresGuard: requiresGuard,
    commandForHash: INITIAL_COMMAND,
    ignoredParameterValues: []
  });
  try {
    const status: OperationStatus = await runner.executeAsync(
      context,
      hasLastState ? { status: OperationStatus.Success } : undefined
    );
    return { status, commands, output: terminalProvider.getOutput(), context };
  } finally {
    executeSpy.mockRestore();
  }
}

function createGuard(
  blockReason: string | undefined,
  rerunReason: string | undefined = undefined
): IIncrementalExecutionGuard & {
  getBlockReasonAsync: jest.Mock;
  verifyIncrementalResultAsync: jest.Mock;
} {
  return {
    getBlockReasonAsync: jest.fn(async () => blockReason),
    verifyIncrementalResultAsync: jest.fn(async () => rerunReason)
  };
}

describe(`${ShellOperationRunner.name} with an incremental command that requires a guard`, () => {
  it('runs the initial command if no guard is registered', async () => {
    const { status, commands, output, context } = await runAsync({ requiresGuard: true });
    expect(status).toBe(OperationStatus.Success);
    expect(commands).toEqual([INITIAL_COMMAND]);
    expect(output).toContain(`Invoking (initial): ${INITIAL_COMMAND}`);
    expect(getCommandExecution(context)).toEqual({ kind: 'initial', hasIncrementalCommand: true });
  });

  it('runs the initial command without asking the guard if the operation has no last state', async () => {
    const guard: ReturnType<typeof createGuard> = createGuard(undefined);
    const { commands } = await runAsync({ requiresGuard: true, guard, hasLastState: false });
    expect(commands).toEqual([INITIAL_COMMAND]);
    expect(guard.getBlockReasonAsync).not.toHaveBeenCalled();
  });

  it('runs the initial command and says why if the guard blocks the incremental command', async () => {
    const guard: ReturnType<typeof createGuard> = createGuard('input files were added, deleted or renamed');
    const { status, commands, output, context } = await runAsync({ requiresGuard: true, guard });
    expect(status).toBe(OperationStatus.Success);
    expect(commands).toEqual([INITIAL_COMMAND]);
    expect(output).toContain(
      'Not using the incremental command because input files were added, deleted or renamed.'
    );
    expect(guard.verifyIncrementalResultAsync).not.toHaveBeenCalled();
    expect(getCommandExecution(context)?.kind).toBe('initial');
  });

  it('runs only the incremental command if the guard allows it and its outputs are verified', async () => {
    const guard: ReturnType<typeof createGuard> = createGuard(undefined);
    const { status, commands, output, context } = await runAsync({ requiresGuard: true, guard });
    expect(status).toBe(OperationStatus.Success);
    expect(commands).toEqual([INCREMENTAL_COMMAND]);
    expect(output).toContain(`Invoking (incremental): ${INCREMENTAL_COMMAND}`);
    expect(guard.verifyIncrementalResultAsync).toHaveBeenCalledTimes(1);
    expect(getCommandExecution(context)).toEqual({ kind: 'incremental', hasIncrementalCommand: true });
  });

  it('runs the initial command after the incremental command if its outputs are not verified', async () => {
    const guard: ReturnType<typeof createGuard> = createGuard(
      undefined,
      'the incremental command changed which output files it has: added "lib/b.js"'
    );
    const { status, commands, output, context } = await runAsync({ requiresGuard: true, guard });
    expect(status).toBe(OperationStatus.Success);
    expect(commands).toEqual([INCREMENTAL_COMMAND, INITIAL_COMMAND]);
    expect(output).toContain(
      'Running the initial command, because the incremental command changed which output files it has: added "lib/b.js".'
    );
    expect(getCommandExecution(context)?.kind).toBe('initial');
  });

  it('does not verify or repeat a failed incremental command', async () => {
    const guard: ReturnType<typeof createGuard> = createGuard(undefined);
    const { status, commands, context } = await runAsync({
      requiresGuard: true,
      guard,
      exitCodeByCommand: { [INCREMENTAL_COMMAND]: 1 }
    });
    expect(status).toBe(OperationStatus.Failure);
    expect(commands).toEqual([INCREMENTAL_COMMAND]);
    expect(guard.verifyIncrementalResultAsync).not.toHaveBeenCalled();
    expect(getCommandExecution(context)?.kind).toBe('incremental');
  });

  it('runs the initial command if the guard fails', async () => {
    const guard: IIncrementalExecutionGuard = {
      getBlockReasonAsync: async () => {
        throw new Error('EACCES: permission denied');
      },
      verifyIncrementalResultAsync: async () => undefined
    };
    const { status, commands, output } = await runAsync({ requiresGuard: true, guard });
    expect(status).toBe(OperationStatus.Success);
    expect(commands).toEqual([INITIAL_COMMAND]);
    expect(output).toContain(
      'Not using the incremental command because its incremental execution guard failed: Error: EACCES: permission denied.'
    );
  });
});

describe(`${ShellOperationRunner.name} with an incremental command that does not require a guard`, () => {
  it('runs the incremental command for an operation with a last state, as in watch mode, without recording it', async () => {
    const guard: ReturnType<typeof createGuard> = createGuard('its command line changed');
    const { commands, context } = await runAsync({ requiresGuard: false, guard });
    expect(commands).toEqual([INCREMENTAL_COMMAND]);
    expect(guard.getBlockReasonAsync).not.toHaveBeenCalled();
    expect(getCommandExecution(context)).toBeUndefined();
  });

  it('runs the initial command for an operation without a last state', async () => {
    const { commands } = await runAsync({ requiresGuard: false, hasLastState: false });
    expect(commands).toEqual([INITIAL_COMMAND]);
  });
});
