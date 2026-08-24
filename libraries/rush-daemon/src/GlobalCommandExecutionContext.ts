// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import { EOL } from 'node:os';

import { SubprocessTerminator } from '@rushstack/node-core-library';
import { Terminal, TerminalProviderSeverity } from '@rushstack/terminal';
import type { ITerminal, ITerminalProvider } from '@rushstack/terminal';

import {
  createGlobalCommandEnvironment,
  type IGlobalCommandEnvironment,
  type IGlobalCommandTerminalProperties,
  type IResolvedGlobalCommandRequest
} from './GlobalCommandRequest';
import type { IGlobalCommandRequestClient } from './GlobalCommandRequestClient';
import type { IWorkspaceSession } from './WorkspaceSession';

const MAX_PENDING_TERMINAL_BYTES: number = 1024 * 1024;

/**
 * Options for a request-scoped child process.
 *
 * @beta
 */
export interface IGlobalCommandSpawnOptions {
  readonly environmentOverlay?: Readonly<NodeJS.ProcessEnv>;
  readonly forwardOutput?: boolean;
  readonly shell?: boolean | string;
  readonly windowsHide?: boolean;
}

/**
 * Explicit state supplied to caller-owned global command logic.
 *
 * @beta
 */
export interface IGlobalCommandExecutionContext {
  readonly abortSignal: AbortSignal;
  readonly cwd: string;
  readonly environment: IGlobalCommandEnvironment;
  readonly terminal: ITerminal;
  readonly terminalProperties: IGlobalCommandTerminalProperties;
  readonly workspaceSession: IWorkspaceSession;

  registerDisposable(disposable: AsyncDisposable): void;
  spawnChild(
    command: string,
    args: ReadonlyArray<string>,
    options?: IGlobalCommandSpawnOptions
  ): childProcess.ChildProcessWithoutNullStreams;
}

class OrderedTerminalWriter {
  readonly #client: IGlobalCommandRequestClient;
  readonly #onFailure: (error: Error) => void;
  #closed: boolean = false;
  #failure: Error | undefined;
  #pendingByteCount: number = 0;
  #tail: Promise<void> = Promise.resolve();

  public constructor(client: IGlobalCommandRequestClient, onFailure: (error: Error) => void) {
    this.#client = client;
    this.#onFailure = onFailure;
  }

  public write(stream: 'stdout' | 'stderr', chunk: Uint8Array): void {
    void this.writeAsync(stream, chunk);
  }

  public writeAsync(stream: 'stdout' | 'stderr', chunk: Uint8Array): Promise<void> {
    if (this.#closed) {
      throw new Error('The global command terminal is closed.');
    }
    this.#pendingByteCount += chunk.byteLength;
    if (this.#pendingByteCount > MAX_PENDING_TERMINAL_BYTES) {
      this.#pendingByteCount -= chunk.byteLength;
      this.#fail(new Error('The global command terminal output exceeded its pending buffer limit.'));
      return this.#tail;
    }
    this.#tail = this.#tail.then(async () => {
      if (this.#failure) {
        return;
      }
      try {
        await this.#client.writeTerminalChunkAsync(stream, chunk);
      } catch (error) {
        this.#fail(normalizeError(error));
      }
    });
    this.#tail = this.#tail.finally(() => {
      this.#pendingByteCount -= chunk.byteLength;
    });
    return this.#tail;
  }

  public async closeAsync(): Promise<void> {
    this.#closed = true;
    await this.#tail;
    if (this.#failure) {
      throw this.#failure;
    }
  }

  #fail(error: Error): void {
    if (!this.#failure) {
      this.#failure = error;
      this.#onFailure(error);
    }
  }
}

class GlobalCommandTerminalProvider implements ITerminalProvider {
  readonly #writer: OrderedTerminalWriter;
  readonly #textEncoder: InstanceType<typeof TextEncoder> = new TextEncoder();

  public readonly eolCharacter: string = EOL;
  public readonly supportsColor: boolean;

  public constructor(writer: OrderedTerminalWriter, supportsColor: boolean) {
    this.#writer = writer;
    this.supportsColor = supportsColor;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    const stream: 'stdout' | 'stderr' =
      severity === TerminalProviderSeverity.error || severity === TerminalProviderSeverity.warning
        ? 'stderr'
        : 'stdout';
    this.#writer.write(stream, this.#textEncoder.encode(data));
  }
}

interface ITrackedChild {
  readonly completion: Promise<void>;
}

export class GlobalCommandExecutionContext
  implements IGlobalCommandExecutionContext, AsyncDisposable
{
  readonly #abortController: AbortController = new AbortController();
  readonly #client: IGlobalCommandRequestClient;
  readonly #disposables: AsyncDisposable[] = [];
  readonly #onClientAbort: () => void;
  readonly #request: IResolvedGlobalCommandRequest;
  readonly #trackedChildren: Set<ITrackedChild> = new Set();
  readonly #childCompletionErrors: unknown[] = [];
  readonly #childTerminationErrors: unknown[] = [];
  readonly #writer: OrderedTerminalWriter;
  #closed: boolean = false;

  public readonly terminal: ITerminal;
  public readonly workspaceSession: IWorkspaceSession;

  public constructor(
    request: IResolvedGlobalCommandRequest,
    client: IGlobalCommandRequestClient,
    workspaceSession: IWorkspaceSession
  ) {
    this.#request = request;
    this.#client = client;
    this.workspaceSession = workspaceSession;
    this.#onClientAbort = () => this.#abortController.abort(client.abortSignal.reason);
    this.#writer = new OrderedTerminalWriter(client, (error: Error) =>
      this.#abortController.abort(error)
    );
    this.terminal = new Terminal(
      new GlobalCommandTerminalProvider(this.#writer, request.terminal.supportsColor)
    );
    if (client.abortSignal.aborted) {
      this.#onClientAbort();
    } else {
      client.abortSignal.addEventListener('abort', this.#onClientAbort, { once: true });
    }
  }

  public get abortSignal(): AbortSignal {
    return this.#abortController.signal;
  }

  public get cwd(): string {
    return this.#request.cwd;
  }

  public get environment(): IGlobalCommandEnvironment {
    return this.#request.environment;
  }

  public get terminalProperties(): IGlobalCommandTerminalProperties {
    return this.#request.terminal;
  }

  public registerDisposable(disposable: AsyncDisposable): void {
    this.#throwIfClosed();
    this.#disposables.push(disposable);
  }

  public spawnChild(
    command: string,
    args: ReadonlyArray<string>,
    options: IGlobalCommandSpawnOptions = {}
  ): childProcess.ChildProcessWithoutNullStreams {
    this.#throwIfClosed();
    if (this.abortSignal.aborted) {
      throw this.abortSignal.reason ?? new Error('The global command request was aborted.');
    }
    const child: childProcess.ChildProcessWithoutNullStreams = childProcess.spawn(command, [...args], {
      cwd: this.cwd,
      detached: SubprocessTerminator.RECOMMENDED_OPTIONS.detached,
      env: createGlobalCommandEnvironment(this.environment, options.environmentOverlay),
      shell: options.shell,
      stdio: 'pipe',
      windowsHide: options.windowsHide
    });
    SubprocessTerminator.killProcessTreeOnExit(child, SubprocessTerminator.RECOMMENDED_OPTIONS);
    const completion: Promise<void> = this.#trackChildAsync(child)
      .catch((error: unknown) => {
        this.#childCompletionErrors.push(error);
      });
    const trackedChild: ITrackedChild = { completion };
    this.#trackedChildren.add(trackedChild);
    void completion.then(() => this.#trackedChildren.delete(trackedChild));
    if (options.forwardOutput !== false) {
      this.#forwardChildOutput(child.stdout, 'stdout');
      this.#forwardChildOutput(child.stderr, 'stderr');
    }
    return child;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#client.abortSignal.removeEventListener('abort', this.#onClientAbort);
    this.#abortController.abort(new Error('The global command execution context was disposed.'));
    const cleanupErrors: unknown[] = [];
    await Promise.all(
      Array.from(this.#trackedChildren, ({ completion }) =>
        collectCleanupErrorAsync(completion, cleanupErrors)
      )
    );
    cleanupErrors.push(...this.#childCompletionErrors);
    cleanupErrors.push(...this.#childTerminationErrors);
    for (const disposable of this.#disposables.reverse()) {
      await collectCleanupErrorAsync(
        Promise.resolve().then(() => disposable[Symbol.asyncDispose]()),
        cleanupErrors
      );
    }
    await collectCleanupErrorAsync(this.#writer.closeAsync(), cleanupErrors);
    throwCleanupErrors(cleanupErrors);
  }

  async #trackChildAsync(child: childProcess.ChildProcessWithoutNullStreams): Promise<void> {
    const terminateChild = (): void => {
      try {
        SubprocessTerminator.killProcessTree(child, SubprocessTerminator.RECOMMENDED_OPTIONS);
      } catch (error) {
        this.#childTerminationErrors.push(error);
        child.kill('SIGKILL');
      }
    };
    this.abortSignal.addEventListener('abort', terminateChild, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', () => resolve());
      });
    } finally {
      this.abortSignal.removeEventListener('abort', terminateChild);
    }
  }

  #forwardChildOutput(
    source: NodeJS.ReadableStream & { pause(): unknown; resume(): unknown },
    stream: 'stdout' | 'stderr'
  ): void {
    source.on('data', (chunk: Buffer) => {
      source.pause();
      void this.#writer.writeAsync(stream, chunk).then(() => {
        if (!this.abortSignal.aborted) {
          source.resume();
        }
      });
    });
    source.resume();
  }

  #throwIfClosed(): void {
    if (this.#closed) {
      throw new Error('The global command execution context is closed.');
    }
  }
}

async function collectCleanupErrorAsync(promise: Promise<void>, cleanupErrors: unknown[]): Promise<void> {
  try {
    await promise;
  } catch (error) {
    cleanupErrors.push(error);
  }
}

function throwCleanupErrors(cleanupErrors: unknown[]): void {
  if (cleanupErrors.length === 1) {
    throw cleanupErrors[0];
  }
  if (cleanupErrors.length > 1) {
    throw new AggregateError(cleanupErrors, 'Failed to clean up global command request resources.');
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
