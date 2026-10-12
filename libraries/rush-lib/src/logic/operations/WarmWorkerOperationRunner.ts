// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import type {
  IAfterExecuteEventMessage,
  IExitCommandMessage,
  IRequestRunEventMessage,
  IRunCommandMessage,
  ISyncEventMessage
} from '@rushstack/operation-graph';
import { SubprocessTerminator } from '@rushstack/node-core-library';
import { TerminalProviderSeverity, type ITerminal, type ITerminalProvider } from '@rushstack/terminal';

import type { IPhase } from '../../api/CommandLineConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { Utilities, type IEnvironment } from '../../utilities/Utilities';
import { IS_WINDOWS } from '../../utilities/executionUtilities';
import type { IOperationRunner, IOperationRunnerContext, IOperationLastState } from './IOperationRunner';
import { OperationError } from './OperationError';
import { OperationStatus } from './OperationStatus';
import {
  getIncrementalExecutionGuard,
  setCommandExecution,
  skipBuildCacheRead,
  type ICommandExecution,
  type IIncrementalExecutionGuard,
  type IIncrementalExecutionGuardOptions
} from './IncrementalExecutionState';
import {
  getGuardResultAsync,
  killExitedProcessGroup,
  ShellOperationRunner,
  type ICommandTerminals
} from './ShellOperationRunner';

const DEFAULT_MAX_RUNS_PER_WORKER: number = 25;
const DEFAULT_MAX_MEMORY_GROWTH: number = 2;
const DEFAULT_CHANGE_REPORT_TIMEOUT_MS: number = 1000;
const EXIT_TIMEOUT_MS: number = 10000;
const BYTES_PER_MB: number = 1024 * 1024;

// A worker keeps its last build in memory and only writes the outputs that changed, so its outputs may be bundles.
const GUARD_OPTIONS: IIncrementalExecutionGuardOptions = { outputsMayBeBundles: true };
const INITIAL_COMMAND_REASON: string = 'the initial command must run';
const FAILED_OPERATION_REASON: string = 'the operation failed, so its next build runs the initial command';

// On Linux and macOS, TypeScript's default file watcher follows the inode of each file. After a file is replaced (git
// deletes and recreates each file that it writes), that watcher can lose track of the file for the life of the
// process, and a worker would then miss every later edit to the file and keep its stale outputs. A watcher on the
// file's folder sees the new file. TypeScript reads the variable only if the tsconfig.json does not set
// `watchOptions.watchFile`, and a value in the operation's environment is kept.
const TYPESCRIPT_WATCH_FILE_VARIABLE: string = 'TSC_WATCHFILE';
const TYPESCRIPT_WATCH_FILE: string = 'UseFsEventsOnParentDirectory';

/**
 * @internal
 */
export interface IWarmWorkerOperationRunnerOptions {
  phase: IPhase;
  rushProject: RushConfigurationProject;
  displayName: string;
  /**
   * The initial command of the operation, which runs in a shell if `initialIpcCommand` is undefined.
   */
  initialCommand: string;
  /**
   * The `<phase>:ipc` command of the operation, if it has one: a worker that builds from scratch and then waits for
   * further runs.
   */
  initialIpcCommand: string | undefined;
  /**
   * The `<phase>:incremental:ipc` command of the operation: a worker that builds on top of the existing outputs and
   * then waits for further runs.
   */
  incrementalIpcCommand: string;
  commandForHash: string;
  ignoredParameterValues: ReadonlyArray<string>;
  /**
   * A worker is closed after this many runs. Defaults to 25.
   */
  maxRunsPerWorker?: number;
  /**
   * A worker is closed once its resident memory is more than this multiple of its resident memory after its first
   * run. Defaults to 2.
   */
  maxMemoryGrowth?: number;
  /**
   * How long a reused worker may take to report a change that it saw, in milliseconds, before it is told to run
   * anyway. A worker decides what to rebuild from the changes that its own file watcher reported, so a run that
   * starts before the watcher saw an edit would not rebuild it. Defaults to 1000.
   */
  changeReportTimeoutMs?: number;
}

interface IRunPlan {
  readonly kind: ICommandExecution['kind'];
  // Printed to the operation's log before the command runs.
  readonly notes: ReadonlyArray<string>;
}

interface IWorkerRunResult {
  readonly status: OperationStatus;
  readonly hasWarningOrError: boolean;
}

interface IWorkerCommandResult {
  readonly status: OperationStatus;
  // Whether the run was sent to a worker that had run before, i.e. one that may keep state from earlier runs.
  readonly wasWorkerReused: boolean;
}

function isAfterExecuteEventMessage(message: unknown): message is IAfterExecuteEventMessage {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as IAfterExecuteEventMessage).event === 'after-execute'
  );
}

function isRequestRunEventMessage(message: unknown): message is IRequestRunEventMessage {
  return (
    !!message && typeof message === 'object' && (message as IRequestRunEventMessage).event === 'requestRun'
  );
}

function isSyncEventMessage(message: unknown): message is ISyncEventMessage {
  return !!message && typeof message === 'object' && (message as ISyncEventMessage).event === 'sync';
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MB)} MB`;
}

/**
 * A long-lived process that runs the operation's command when it receives a "run" message, and keeps the state of
 * its last build in memory between runs.
 */
export class WarmWorker {
  public readonly process: ChildProcess;
  public readonly command: string;
  public readonly closedPromise: Promise<void>;
  public readyPromise: Promise<void>;
  /**
   * True once the process sent "sync", i.e. it supports the IPC protocol.
   */
  public isReady: boolean = false;
  /**
   * True if the process reported a change since it was last told to run.
   */
  public isRunRequested: boolean = false;
  public runCount: number = 0;
  public firstResidentMemoryBytes: number | undefined;
  public residentMemoryBytes: number | undefined;

  #onRunRequested: (() => void) | undefined;

  public constructor(childProcess: ChildProcess, command: string) {
    this.process = childProcess;
    this.command = command;
    this.closedPromise = new Promise<void>((resolve: () => void) => {
      childProcess.once('close', () => resolve());
    });
    let resolveReady!: () => void;
    this.readyPromise = new Promise<void>((resolve: () => void) => {
      resolveReady = resolve;
    });
    childProcess.on('message', (message: unknown) => {
      if (isSyncEventMessage(message)) {
        this.isReady = true;
        resolveReady();
      } else if (isRequestRunEventMessage(message)) {
        this.isRunRequested = true;
        this.#onRunRequested?.();
      }
    });
    // Without a listener, an 'error' event would be thrown; the 'close' event reports the outcome.
    childProcess.on('error', () => undefined);
  }

  public get pid(): number | undefined {
    return this.process.pid;
  }

  public get isAlive(): boolean {
    return this.process.exitCode === null && this.process.signalCode === null;
  }

  /**
   * Waits until the process reports a change, for at most `timeoutMs`. Returns false if it did not.
   */
  public async waitForRunRequestAsync(
    timeoutMs: number,
    abortSignal: AbortSignal | undefined
  ): Promise<boolean> {
    if (this.isRunRequested || timeoutMs <= 0) {
      return this.isRunRequested;
    }
    await new Promise<void>((resolve: () => void) => {
      const timer: { timeout?: NodeJS.Timeout } = {};
      const finish: () => void = () => {
        clearTimeout(timer.timeout);
        this.#onRunRequested = undefined;
        abortSignal?.removeEventListener('abort', finish);
        this.process.off('close', finish);
        resolve();
      };
      timer.timeout = setTimeout(finish, timeoutMs);
      this.#onRunRequested = finish;
      abortSignal?.addEventListener('abort', finish, { once: true });
      this.process.once('close', finish);
    });
    return this.isRunRequested;
  }

  public terminate(): void {
    try {
      if (!IS_WINDOWS && this.process.pid !== undefined && !this.isAlive) {
        // It exited, or a signal killed it, but descendants in its process group may still hold its stdio open.
        killExitedProcessGroup(this.process.pid);
      } else if (this.isAlive) {
        SubprocessTerminator.killProcessTree(this.process, SubprocessTerminator.RECOMMENDED_OPTIONS);
      }
    } catch {
      // It exited in the meantime.
    }
    if (IS_WINDOWS && !this.isAlive) {
      for (const stream of this.process.stdio) {
        stream?.destroy();
      }
    }
  }

  /**
   * Asks the process to exit and waits until it closed. Terminates it if it cannot be asked, or if it does not
   * exit in time.
   */
  public async closeAsync(): Promise<void> {
    if (this.isAlive) {
      if (this.process.connected) {
        const exitCommand: IExitCommandMessage = { command: 'exit' };
        try {
          this.process.send(exitCommand);
        } catch {
          this.terminate();
        }
      } else {
        this.terminate();
      }
    }
    // Even after it exited, the stdio of the process or of its descendants may still be draining.
    const timeout: NodeJS.Timeout = setTimeout(() => this.terminate(), EXIT_TIMEOUT_MS);
    try {
      await this.closedPromise;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * An `IOperationRunner` for the Rush daemon that runs the incremental builds of an operation in a warm worker: a
 * long-lived process, started from the project's `<phase>:incremental:ipc` script, that keeps its last build in
 * memory and rebuilds only what changed when it is told to run again.
 *
 * @remarks
 * Whether a run may build on top of the outputs of the last one is decided by the operation's incremental
 * execution guard, as for `ShellOperationRunner`, in `prepareAsync`. If the guard allows it and the worker is
 * running, the build cache is not read, because restoring the outputs would not update the worker's memory. If the
 * guard does not allow it, the worker is closed, and the initial command runs: in a new worker, if the project has
 * a `<phase>:ipc` script, or else in a shell. The initial command also runs after a failed run on a reused worker,
 * or on a worker that exited, so that state that a worker kept from its earlier runs cannot fail an operation that
 * the initial command passes. The failed first run of a new worker is reported as it stands, because that run had
 * no earlier state. After a failure, the worker is closed, because the next build runs the initial command. If
 * `closeAsync` closes a worker between executions, e.g. for the warm set of the Rush daemon, the next execution
 * says so. Results of incremental runs are never written to the build cache.
 *
 * @internal
 */
export class WarmWorkerOperationRunner implements IOperationRunner {
  public readonly name: string;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean;
  public readonly isNoOp: boolean = false;

  readonly #rushProject: RushConfigurationProject;
  readonly #initialCommand: string;
  readonly #initialIpcCommand: string | undefined;
  readonly #incrementalIpcCommand: string;
  readonly #commandForHash: string;
  readonly #ignoredParameterValues: ReadonlyArray<string>;
  readonly #maxRunsPerWorker: number;
  readonly #maxMemoryGrowth: number;
  readonly #changeReportTimeoutMs: number;
  readonly #planByContext: WeakMap<object, IRunPlan> = new WeakMap();

  #worker: WarmWorker | undefined;
  // Resolves when the last worker that was closed has exited.
  #lastClosePromise: Promise<void> = Promise.resolve();
  // Set when `closeAsync` closes a worker between executions, e.g. for the warm set of the Rush daemon. The next
  // plan writes it, because the next execution would otherwise not say why the worker is gone.
  #closedWorkerNote: string | undefined;

  public constructor(options: IWarmWorkerOperationRunnerOptions) {
    const {
      phase,
      rushProject,
      displayName,
      initialCommand,
      initialIpcCommand,
      incrementalIpcCommand,
      commandForHash,
      ignoredParameterValues,
      maxRunsPerWorker = DEFAULT_MAX_RUNS_PER_WORKER,
      maxMemoryGrowth = DEFAULT_MAX_MEMORY_GROWTH,
      changeReportTimeoutMs = DEFAULT_CHANGE_REPORT_TIMEOUT_MS
    } = options;
    this.name = displayName;
    this.warningsAreAllowed =
      EnvironmentConfiguration.allowWarningsInSuccessfulBuild || phase.allowWarningsOnSuccess || false;
    this.#rushProject = rushProject;
    this.#initialCommand = initialCommand;
    this.#initialIpcCommand = initialIpcCommand;
    this.#incrementalIpcCommand = incrementalIpcCommand;
    this.#commandForHash = commandForHash;
    this.#ignoredParameterValues = ignoredParameterValues;
    this.#maxRunsPerWorker = maxRunsPerWorker;
    this.#maxMemoryGrowth = maxMemoryGrowth;
    this.#changeReportTimeoutMs = changeReportTimeoutMs;
  }

  public get isActive(): boolean {
    return !!this.#worker?.isAlive;
  }

  public get residentMemoryBytes(): number | undefined {
    return this.isActive ? this.#worker!.residentMemoryBytes : undefined;
  }

  /**
   * The process ID of the worker, if one is running.
   */
  public get workerPid(): number | undefined {
    return this.isActive ? this.#worker!.pid : undefined;
  }

  /**
   * Decides how the next execution with this context runs. Call it before the build cache is read, i.e. from a
   * `beforeExecuteOperationAsync` tap that runs before `CacheableOperationPlugin`'s, and call
   * `writeUnusedNotesAsync` after the operation executed.
   *
   * @param context - The execution record of the operation
   * @param hasLastState - Whether the operation has a result from an earlier execution in this graph
   */
  public async prepareAsync(context: IOperationRunnerContext, hasLastState: boolean): Promise<void> {
    this.#planByContext.set(context, await this.#planAsync(context, hasLastState));
  }

  public async executeAsync(
    context: IOperationRunnerContext,
    lastState?: IOperationLastState
  ): Promise<OperationStatus> {
    const preparedPlan: IRunPlan | undefined = this.#planByContext.get(context);
    this.#planByContext.delete(context);
    // Without a last state, e.g. in an iteration that allows no incremental build, the initial command runs.
    const plan: IRunPlan =
      preparedPlan && (preparedPlan.kind === 'initial' || lastState)
        ? preparedPlan
        : await this.#planAsync(context, !!lastState);
    return await context.runWithTerminalAsync(
      async (
        terminal: ITerminal,
        terminalProvider: ITerminalProvider,
        structuredChildOutputTerminalProvider: ITerminalProvider
      ): Promise<OperationStatus> => {
        if (this.#ignoredParameterValues.length > 0) {
          terminal.writeLine(
            `These parameters were ignored for this operation by project-level configuration: ${this.#ignoredParameterValues.join(' ')}`
          );
        }
        for (const note of plan.notes) {
          terminal.writeLine(note);
        }
        this.#closedWorkerNote = undefined;

        const terminals: ICommandTerminals = {
          terminal,
          terminalProvider,
          structuredChildOutputTerminalProvider
        };
        let status: OperationStatus;
        if (plan.kind === 'initial') {
          status = await this.#runInitialAsync(context, terminals);
        } else {
          const { status: workerStatus, wasWorkerReused } = await this.#runOnWorkerAsync(
            context,
            terminals,
            'incremental',
            this.#incrementalIpcCommand
          );
          status = workerStatus;
          if (status === OperationStatus.Success || status === OperationStatus.SuccessWithWarning) {
            const guard: IIncrementalExecutionGuard | undefined = getIncrementalExecutionGuard(context);
            const rerunReason: string | undefined = guard
              ? await getGuardResultAsync(() => guard.verifyIncrementalResultAsync(GUARD_OPTIONS))
              : undefined;
            if (rerunReason !== undefined) {
              terminal.writeLine(`Running the initial command, because ${rerunReason}.`);
              await this.#closeWorkerAsync(terminal, INITIAL_COMMAND_REASON);
              status = await this.#runInitialAsync(context, terminals);
            }
          } else if (status === OperationStatus.Failure && (wasWorkerReused || !this.isActive)) {
            // A reused worker can fail where the initial command passes, because of state that it kept from its
            // earlier runs, and so can a worker that crashed. The initial command then decides whether the
            // operation fails.
            if (context.error) {
              terminal.writeLine(context.error.message);
              context.error = undefined;
            }
            terminal.writeLine('Running the initial command, because the run on the warm worker failed.');
            await this.#closeWorkerAsync(terminal, INITIAL_COMMAND_REASON);
            status = await this.#runInitialAsync(context, terminals);
          }
        }

        if (!context.shouldRunnerPersist) {
          await this.#closeWorkerAsync(undefined, '');
        } else if (status === OperationStatus.Failure) {
          await this.#closeWorkerAsync(terminal, FAILED_OPERATION_REASON);
        } else {
          await this.#recycleWorkerIfNeededAsync(terminal);
        }
        return status;
      },
      {
        createLogFile: true
      }
    );
  }

  public getConfigHash(): string {
    return this.#commandForHash;
  }

  /**
   * Writes the notes of the plan that `prepareAsync` made for this context if `executeAsync` did not run, e.g.
   * because the build cache restored the operation, so that a worker that the plan closed is not closed silently.
   * Call it after the operation executed.
   */
  public async writeUnusedNotesAsync(context: IOperationRunnerContext): Promise<void> {
    const plan: IRunPlan | undefined = this.#planByContext.get(context);
    this.#planByContext.delete(context);
    if (plan) {
      this.#closedWorkerNote = undefined;
    }
    if (plan?.notes.length) {
      // The log file, if any, is not this runner's, e.g. the one that the build cache restored.
      await context.runWithTerminalAsync(
        async (terminal: ITerminal): Promise<void> => {
          for (const note of plan.notes) {
            terminal.writeLine(note);
          }
        },
        { createLogFile: false }
      );
    }
  }

  public async closeAsync(): Promise<void> {
    const worker: WarmWorker | undefined = this.#worker;
    if (worker?.isAlive) {
      this.#closedWorkerNote = `The warm worker (pid ${worker.pid}) was closed after the operation last ran.`;
    }
    await this.#closeWorkerAsync(undefined, '');
  }

  async #planAsync(context: IOperationRunnerContext, hasLastState: boolean): Promise<IRunPlan> {
    // It stays until a plan's notes are written, e.g. if this plan is replaced.
    const notes: string[] = this.#closedWorkerNote ? [this.#closedWorkerNote] : [];
    // As in ShellOperationRunner, the guard is not consulted before the first execution in this graph.
    const guard: IIncrementalExecutionGuard | undefined = hasLastState
      ? getIncrementalExecutionGuard(context)
      : undefined;
    if (guard) {
      const blockReason: string | undefined = await getGuardResultAsync(() =>
        guard.getBlockReasonAsync(GUARD_OPTIONS)
      );
      if (blockReason === undefined) {
        if (this.isActive) {
          skipBuildCacheRead(context);
        }
        return { kind: 'incremental', notes };
      }
      notes.push(`Not using the incremental command because ${blockReason}.`);
    }
    // The initial command must not run on top of what a worker keeps in memory.
    const closeNote: string | undefined = await this.#closeWorkerAsync(undefined, INITIAL_COMMAND_REASON);
    if (closeNote) {
      notes.push(closeNote);
    }
    return { kind: 'initial', notes };
  }

  async #runInitialAsync(
    context: IOperationRunnerContext,
    terminals: ICommandTerminals
  ): Promise<OperationStatus> {
    if (this.#initialIpcCommand !== undefined) {
      return (await this.#runOnWorkerAsync(context, terminals, 'initial', this.#initialIpcCommand)).status;
    }
    setCommandExecution(context, { kind: 'initial', hasIncrementalCommand: true });
    return await ShellOperationRunner.invokeCommandAsync(
      context,
      terminals,
      this.#rushProject,
      'initial',
      this.#initialCommand
    );
  }

  async #runOnWorkerAsync(
    context: IOperationRunnerContext,
    { terminal, terminalProvider }: ICommandTerminals,
    kind: ICommandExecution['kind'],
    command: string
  ): Promise<IWorkerCommandResult> {
    // Recorded before the command starts, so that outputs of a command that fails or is aborted are attributed to it.
    setCommandExecution(context, { kind, hasIncrementalCommand: true, watchesInputs: true });
    terminal.writeLine(`Invoking (${kind}): ${command}`);

    const { abortSignal } = context;
    let worker: WarmWorker | undefined = this.#worker;
    if (worker?.isAlive && kind === 'initial') {
      // A build from scratch must not run on top of what a worker keeps in memory.
      await this.#closeWorkerAsync(terminal, INITIAL_COMMAND_REASON);
      worker = undefined;
    }
    let wasRunRequested: boolean = false;
    if (worker?.isAlive) {
      wasRunRequested = await worker.waitForRunRequestAsync(this.#changeReportTimeoutMs, abortSignal);
    }
    if (worker && !worker.isAlive) {
      terminal.writeLine(`The warm worker (pid ${worker.pid}) exited after its last run.`);
      await this.#closeWorkerAsync(undefined, '');
      worker = undefined;
    }

    const wasWorkerReused: boolean = worker !== undefined && worker.runCount > 0;
    if (!worker) {
      terminal.writeLine('Starting a warm worker for it.');
      worker = this.#startWorker(context, command);
    } else {
      if (!wasRunRequested) {
        terminal.writeVerboseLine(
          `The warm worker did not report a change within ${this.#changeReportTimeoutMs} ms.`
        );
      }
      terminal.writeLine(`Sending run ${worker.runCount + 1} to the warm worker (pid ${worker.pid}).`);
    }

    const { status, hasWarningOrError } = await this.#runWorkerAsync(
      context,
      worker,
      terminal,
      terminalProvider
    );
    return {
      status:
        status === OperationStatus.Success && hasWarningOrError ? OperationStatus.SuccessWithWarning : status,
      wasWorkerReused
    };
  }

  #startWorker(context: IOperationRunnerContext, command: string): WarmWorker {
    const { rushConfiguration, projectFolder } = this.#rushProject;
    const environment: IEnvironment | undefined = context.environment;
    const additionalEnvironment: IEnvironment | undefined =
      (environment ?? process.env)[TYPESCRIPT_WATCH_FILE_VARIABLE] === undefined
        ? { [TYPESCRIPT_WATCH_FILE_VARIABLE]: TYPESCRIPT_WATCH_FILE }
        : undefined;
    const childProcess: ChildProcess = Utilities.executeLifecycleCommandAsync(command, {
      rushConfiguration,
      workingDirectory: projectFolder,
      initCwd: rushConfiguration.commonTempFolder,
      handleOutput: true,
      environmentPathOptions: {
        includeProjectBin: true
      },
      ipc: true,
      // Isolate the process tree, so that it can be terminated.
      connectSubprocessTerminator: true,
      initialEnvironment: environment,
      additionalEnvironment
    });
    const worker: WarmWorker = new WarmWorker(childProcess, command);
    this.#worker = worker;
    return worker;
  }

  async #runWorkerAsync(
    context: IOperationRunnerContext,
    worker: WarmWorker,
    terminal: ITerminal,
    terminalProvider: ITerminalProvider
  ): Promise<IWorkerRunResult> {
    const { process: subProcess } = worker;
    const { abortSignal } = context;
    let hasWarningOrError: boolean = false;
    const stdoutDecoder: StringDecoder = new StringDecoder('utf8');
    const stderrDecoder: StringDecoder = new StringDecoder('utf8');
    const onStdout = (data: Buffer): void => {
      terminalProvider.write(stdoutDecoder.write(data), TerminalProviderSeverity.log);
    };
    const onStderr = (data: Buffer): void => {
      terminalProvider.write(stderrDecoder.write(data), TerminalProviderSeverity.error);
      hasWarningOrError = true;
    };
    subProcess.stdout?.on('data', onStdout);
    subProcess.stderr?.on('data', onStderr);

    let sentRun: boolean = false;
    let sendError: Error | undefined;
    const onAbort = (): void => {
      worker.terminate();
    };
    const status: OperationStatus = await new Promise<OperationStatus>(
      (resolve: (status: OperationStatus) => void) => {
        let detach: () => void = () => undefined;
        const finish = (result: OperationStatus): void => {
          detach();
          resolve(result);
        };
        const onMessage = (message: unknown): void => {
          if (sentRun && isAfterExecuteEventMessage(message)) {
            const memory: number | undefined = message.residentMemoryBytes;
            worker.residentMemoryBytes =
              typeof memory === 'number' && Number.isSafeInteger(memory) && memory > 0 ? memory : undefined;
            if (worker.runCount === 1) {
              worker.firstResidentMemoryBytes = worker.residentMemoryBytes;
            }
            // These types are distinct, but have the same values.
            finish(message.status as unknown as OperationStatus);
          }
        };
        const onClose = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
          if (abortSignal?.aborted) {
            finish(OperationStatus.Aborted);
          } else if (sendError) {
            context.error = new OperationError('error', sendError.message);
            finish(OperationStatus.Failure);
          } else if (sentRun) {
            context.error = new OperationError(
              'error',
              `The warm worker exited before it reported the result of its run (${
                signal ? `signal ${signal}` : `exit code ${exitCode}`
              }).`
            );
            finish(OperationStatus.Failure);
          } else if (signal) {
            // It exited without using the IPC protocol, so it ran once, like a command in a shell.
            context.error = new OperationError('error', `Terminated by signal: ${signal}`);
            finish(OperationStatus.Failure);
          } else if (exitCode !== 0) {
            context.error = new OperationError('error', `Returned error code: ${exitCode}`);
            finish(OperationStatus.Failure);
          } else {
            finish(OperationStatus.Success);
          }
        };

        detach = () => {
          subProcess.off('message', onMessage);
          subProcess.off('close', onClose);
        };
        subProcess.on('message', onMessage);
        subProcess.once('close', onClose);
        if (abortSignal?.aborted) {
          onAbort();
        } else {
          abortSignal?.addEventListener('abort', onAbort, { once: true });
        }
        worker.readyPromise.then(
          () => {
            if (!worker.isAlive || abortSignal?.aborted) {
              return;
            }
            const runCommand: IRunCommandMessage = { command: 'run' };
            worker.isRunRequested = false;
            worker.runCount++;
            sentRun = true;
            try {
              subProcess.send(runCommand);
            } catch (error) {
              sendError = new Error(`Could not send "run" to the warm worker: ${error}`);
              worker.terminate();
            }
          },
          () => undefined
        );
      }
    );
    abortSignal?.removeEventListener('abort', onAbort);
    subProcess.stdout?.off('data', onStdout);
    subProcess.stderr?.off('data', onStderr);
    terminalProvider.write(stdoutDecoder.end(), TerminalProviderSeverity.log);
    terminalProvider.write(stderrDecoder.end(), TerminalProviderSeverity.error);

    if (status === OperationStatus.Aborted) {
      // The worker was terminated, so the next run starts a new one.
      await this.#closeWorkerAsync(undefined, '');
      terminal.writeLine('Terminated because the operation was aborted.');
    } else if (!worker.isAlive) {
      await this.#closeWorkerAsync(undefined, '');
    }
    return { status, hasWarningOrError };
  }

  async #recycleWorkerIfNeededAsync(terminal: ITerminal): Promise<void> {
    const worker: WarmWorker | undefined = this.#worker;
    if (!worker?.isAlive) {
      return;
    }
    const { runCount, firstResidentMemoryBytes, residentMemoryBytes } = worker;
    if (runCount >= this.#maxRunsPerWorker) {
      await this.#closeWorkerAsync(terminal, `it has run ${runCount} times`);
    } else if (
      firstResidentMemoryBytes !== undefined &&
      residentMemoryBytes !== undefined &&
      residentMemoryBytes > firstResidentMemoryBytes * this.#maxMemoryGrowth
    ) {
      await this.#closeWorkerAsync(
        terminal,
        `its memory grew from ${formatMegabytes(firstResidentMemoryBytes)} after its first run to ${formatMegabytes(
          residentMemoryBytes
        )}`
      );
    }
  }

  /**
   * Closes the worker, if there is one. Returns the line that says so if it was running, and writes it to the
   * terminal if one is given.
   */
  async #closeWorkerAsync(terminal: ITerminal | undefined, reason: string): Promise<string | undefined> {
    const worker: WarmWorker | undefined = this.#worker;
    if (!worker) {
      // It may still be closing for another caller.
      await this.#lastClosePromise;
      return undefined;
    }
    this.#worker = undefined;
    const note: string | undefined =
      worker.isAlive && reason
        ? `Closing the warm worker (pid ${worker.pid}), because ${reason}.`
        : undefined;
    if (note) {
      terminal?.writeLine(note);
    }
    const closePromise: Promise<void> = worker.closeAsync();
    this.#lastClosePromise = closePromise;
    await closePromise;
    return note;
  }
}
