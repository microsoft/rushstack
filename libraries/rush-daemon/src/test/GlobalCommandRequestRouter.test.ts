// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { SubprocessTerminator } from '@rushstack/node-core-library';
import { encodeDaemonStdinChunk } from '@rushstack/rush-daemon-protocol';
import type {
  IDaemonCommandResult,
  IDaemonSetRawModeMessage,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import { DaemonRequiresInProcessError } from '../DaemonTerminalPolicy';
import type { IGlobalCommandExecutionContext } from '../GlobalCommandExecutionContext';
import type {
  IResolvedGlobalCommandRequest,
  IResolveGlobalCommandRequestOptions
} from '../GlobalCommandRequest';
import type { IGlobalCommandRequestClient } from '../GlobalCommandRequestClient';
import {
  GlobalCommandRequestRouter,
  type IGlobalCommandExecutionResult,
  type IGlobalCommandRequestResult
} from '../GlobalCommandRequestRouter';
import {
  InteractiveRequestInputRouter,
  type IInteractiveRequestSession
} from '../InteractiveRequestInputRouter';
import { TestWorkspaceSession, TEST_REPO_ROOT } from './TestWorkspaceSession';

const TEXT_DECODER: InstanceType<typeof TextDecoder> = new TextDecoder();
const FIRST_CWD: string = path.join(TEST_REPO_ROOT, 'libraries', 'rush-daemon');
const SECOND_CWD: string = path.join(TEST_REPO_ROOT, 'libraries', 'terminal');

interface IClientChunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

class TestGlobalCommandClient implements IGlobalCommandRequestClient {
  public readonly abortController: AbortController = new AbortController();
  public readonly chunks: IClientChunk[] = [];
  public readonly results: IDaemonCommandResult[] = [];
  public readonly policies: IDaemonTerminalPolicyResult[] = [];
  public readonly writeOrder: Array<'chunk' | 'result'> = [];
  public interactiveSession: IInteractiveRequestSession | undefined;
  public onWriteAsync: ((chunk: IClientChunk) => Promise<void>) | undefined;
  public onResultAsync: ((result: IDaemonCommandResult) => Promise<void>) | undefined;

  public get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public async writeTerminalChunkAsync(
    stream: 'stdout' | 'stderr',
    chunk: Uint8Array
  ): Promise<void> {
    const clientChunk: IClientChunk = { stream, text: TEXT_DECODER.decode(chunk) };
    this.chunks.push(clientChunk);
    await this.onWriteAsync?.(clientChunk);
    this.writeOrder.push('chunk');
  }

  public async writeResultAsync(result: IDaemonCommandResult): Promise<void> {
    await this.onResultAsync?.(result);
    this.results.push(result);
    this.writeOrder.push('result');
  }

  public writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void> {
    this.policies.push(result);
    return Promise.resolve();
  }
}

function createRequestOptions(
  requestId: string,
  cwd: string,
  environment: Readonly<NodeJS.ProcessEnv>,
  columns: number
): IResolveGlobalCommandRequestOptions {
  return {
    commandName: 'global-test',
    cwd,
    environment,
    requestId,
    terminal: { columns, isTTY: true, supportsColor: columns > 100 }
  };
}

function getCanonicalPath(folderPath: string): string {
  return fs.realpathSync.native(folderPath);
}

function waitForAbortAsync(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
    } else {
      signal.addEventListener('abort', () => resolve(), { once: true });
    }
  });
}

function createRecordingDisposable(name: string, disposalOrder: string[]): AsyncDisposable {
  return {
    [Symbol.asyncDispose]: (): Promise<void> => {
      disposalOrder.push(name);
      return Promise.resolve();
    }
  };
}

describe(GlobalCommandRequestRouter.name, () => {
  it('isolates concurrent cwd, environment, and terminal state without changing daemon globals', async () => {
    const processCwd: string = process.cwd();
    const processEnvironmentValue: string | undefined = process.env.RUSHD_CONTEXT_TEST;
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const observations: string[] = [];
    let releaseExecutors: (() => void) | undefined;
    let startedCount: number = 0;
    const executorsStarted: Promise<void> = new Promise((resolve) => {
      releaseExecutors = resolve;
    });
    const runAsync = async (
      request: IResolvedGlobalCommandRequest,
      client: TestGlobalCommandClient
    ): Promise<IGlobalCommandRequestResult> =>
      router.executeAsync(
        request,
        async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
          observations.push(
            [
              context.cwd,
              context.environment.get('RUSHD_CONTEXT_TEST'),
              context.terminalProperties.columns,
              context.terminalProperties.supportsColor
            ].join('|')
          );
          context.terminal.writeLine(request.requestId);
          if (++startedCount === 2) {
            releaseExecutors?.();
          }
          await executorsStarted;
          expect(process.cwd()).toBe(processCwd);
          expect(process.env.RUSHD_CONTEXT_TEST).toBe(processEnvironmentValue);
          return { exitCode: 0 };
        },
        client
      );
    const firstClient: TestGlobalCommandClient = new TestGlobalCommandClient();
    const secondClient: TestGlobalCommandClient = new TestGlobalCommandClient();
    const firstRequest: IResolvedGlobalCommandRequest = router.resolveRequest(
      createRequestOptions('first', FIRST_CWD, { RUSHD_CONTEXT_TEST: 'first' }, 80)
    );
    const secondRequest: IResolvedGlobalCommandRequest = router.resolveRequest(
      createRequestOptions('second', SECOND_CWD, { RUSHD_CONTEXT_TEST: 'second' }, 160)
    );

    const results: IGlobalCommandRequestResult[] = await Promise.all([
      runAsync(firstRequest, firstClient),
      runAsync(secondRequest, secondClient)
    ]);

    expect(results).toEqual([
      {
        aborted: false,
        errorMessage: undefined,
        exitCode: 0,
        outcome: 'success',
        requestId: 'first'
      },
      {
        aborted: false,
        errorMessage: undefined,
        exitCode: 0,
        outcome: 'success',
        requestId: 'second'
      }
    ]);
    expect(new Set(observations)).toEqual(
      new Set([
        `${getCanonicalPath(FIRST_CWD)}|first|80|false`,
        `${getCanonicalPath(SECOND_CWD)}|second|160|true`
      ])
    );
    expect(firstClient.chunks.map(({ text }) => text).join('')).toContain('first');
    expect(secondClient.chunks.map(({ text }) => text).join('')).toContain('second');
    expect(firstClient.results).toEqual([results[0]]);
    expect(secondClient.results).toEqual([results[1]]);
    expect(firstClient.writeOrder[firstClient.writeOrder.length - 1]).toBe('result');
    expect(secondClient.writeOrder[secondClient.writeOrder.length - 1]).toBe('result');
    expect(process.cwd()).toBe(processCwd);
    expect(process.env.RUSHD_CONTEXT_TEST).toBe(processEnvironmentValue);
  });

  it('preserves a global command exit code and delivers it exactly once', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();

    const result: IGlobalCommandRequestResult = await router.executeAsync(
      router.resolveRequest(createRequestOptions('exit-code', FIRST_CWD, {}, 80)),
      async (): Promise<IGlobalCommandExecutionResult> => ({ exitCode: 7 }),
      client
    );

    expect(result).toEqual({
      aborted: false,
      errorMessage: undefined,
      exitCode: 7,
      outcome: 'failure',
      requestId: 'exit-code'
    });
    expect(client.results).toEqual([result]);
    expect(client.writeOrder).toEqual(['result']);
  });

  it.each([undefined, {}])(
    'converts malformed global executor result %# to failure',
    async (invalidResult) => {
      const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
        new TestWorkspaceSession(TEST_REPO_ROOT)
      );
      const client: TestGlobalCommandClient = new TestGlobalCommandClient();

      const result: IGlobalCommandRequestResult = await router.executeAsync(
        router.resolveRequest(createRequestOptions('invalid-result', FIRST_CWD, {}, 80)),
        async (): Promise<IGlobalCommandExecutionResult> =>
          invalidResult as IGlobalCommandExecutionResult,
        client
      );

      expect(result).toMatchObject({
        aborted: false,
        errorMessage: 'A global command executor must return a nonnegative safe-integer exit code.',
        exitCode: 1,
        outcome: 'failure'
      });
      expect(client.results).toEqual([result]);
    }
  );

  it('snapshots request environment and propagates isolated context to child processes', async () => {
    const mutableEnvironment: NodeJS.ProcessEnv = {
      CHILD_CONTEXT: 'request',
      REMOVED_CONTEXT: 'remove-me'
    };
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const request: IResolvedGlobalCommandRequest = router.resolveRequest(
      createRequestOptions('spawn', FIRST_CWD, mutableEnvironment, 80)
    );
    mutableEnvironment.CHILD_CONTEXT = 'mutated-after-resolution';
    const copiedEnvironment: NodeJS.ProcessEnv = request.environment.toObject();
    copiedEnvironment.CHILD_CONTEXT = 'mutated-copy';
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();

    await router.executeAsync(
      request,
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        const child = context.spawnChild(
          process.execPath,
          [
            '-e',
            'process.stdout.write(JSON.stringify({cwd:process.cwd(),value:process.env.CHILD_CONTEXT,removed:process.env.REMOVED_CONTEXT}))'
          ],
          {
            environmentOverlay: {
              CHILD_CONTEXT: `${context.environment.get('CHILD_CONTEXT')}-child`,
              REMOVED_CONTEXT: undefined
            }
          }
        );
        child.stdout.setEncoding('utf8');
        await new Promise<void>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', () => resolve());
        });
        return { exitCode: 0 };
      },
      client
    );

    const childOutput: { cwd: string; removed?: string; value: string } = JSON.parse(
      client.chunks
        .filter(({ stream }) => stream === 'stdout')
        .map(({ text }) => text)
        .join('')
    );
    expect(childOutput).toEqual({
      cwd: getCanonicalPath(FIRST_CWD),
      value: 'request-child'
    });
    expect(request.environment.get('CHILD_CONTEXT')).toBe('request');
  });

  (process.platform === 'win32' ? it.skip : it)(
    'cleans a completed child process group before forgetting it',
    async () => {
      const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
      const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
      const originalProcessKill: typeof process.kill = process.kill.bind(process);
      const processKillSpy: jest.SpyInstance = jest
        .spyOn(process, 'kill')
        .mockImplementation((pid: number, signal?: string | number): true => {
          return pid < 0 ? true : originalProcessKill(pid, signal);
        });
      let childPid: number | undefined;
      try {
        await router.executeAsync(
          router.resolveRequest(createRequestOptions('completed-child', FIRST_CWD, {}, 80)),
          async (
            context: IGlobalCommandExecutionContext
          ): Promise<IGlobalCommandExecutionResult> => {
            const child = context.spawnChild(process.execPath, ['-e', '']);
            childPid = child.pid;
            await new Promise<void>((resolve) => child.once('close', () => resolve()));
            return { exitCode: 0 };
          },
          new TestGlobalCommandClient()
        );

        if (childPid === undefined) {
          throw new Error('The test child did not receive a process ID.');
        }
        expect(processKillSpy).toHaveBeenCalledWith(-childPid, 'SIGKILL');
      } finally {
        processKillSpy.mockRestore();
      }
    }
  );

  it('reports child spawn failures during request cleanup', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);

    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('spawn-failure', FIRST_CWD, {}, 80)),
        async (
          context: IGlobalCommandExecutionContext
        ): Promise<IGlobalCommandExecutionResult> => {
          context.spawnChild(path.join(FIRST_CWD, 'missing-global-command'), [], {
            forwardOutput: false
          });
          await new Promise<void>((resolve) => setImmediate(resolve));
          return { exitCode: 0 };
        },
        new TestGlobalCommandClient()
      )
    ).resolves.toMatchObject({
      errorMessage: expect.stringMatching(/ENOENT|spawn/),
      exitCode: 1,
      outcome: 'failure'
    });
  });

  it('rejects non-string values in untrusted environment snapshots and overlays', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const invalidEnvironment: NodeJS.ProcessEnv = JSON.parse('{"INVALID_VALUE":123}') as NodeJS.ProcessEnv;

    expect(() =>
      router.resolveRequest(createRequestOptions('invalid-environment', FIRST_CWD, invalidEnvironment, 80))
    ).toThrow('environment variable "INVALID_VALUE" must have a string value');

    const invalidOverlay: NodeJS.ProcessEnv = JSON.parse('{"INVALID_OVERLAY":false}') as NodeJS.ProcessEnv;
    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('invalid-overlay', FIRST_CWD, {}, 80)),
        async (
          context: IGlobalCommandExecutionContext
        ): Promise<IGlobalCommandExecutionResult> => {
          context.spawnChild(process.execPath, [], { environmentOverlay: invalidOverlay });
          return { exitCode: 0 };
        },
        new TestGlobalCommandClient()
      )
    ).resolves.toMatchObject({
      errorMessage: 'The global command environment variable "INVALID_OVERLAY" must have a string value.',
      exitCode: 1,
      outcome: 'failure'
    });
  });

  it('cleans registered resources after success and failure without disposing the warm session', async () => {
    let sessionDisposeCount: number = 0;
    let requestDisposeCount: number = 0;
    const session: TestWorkspaceSession = new TestWorkspaceSession(
      TEST_REPO_ROOT,
      () => sessionDisposeCount++
    );
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const registerDisposable = (context: IGlobalCommandExecutionContext): void => {
      context.registerDisposable({
        [Symbol.asyncDispose]: (): Promise<void> => {
          requestDisposeCount++;
          return Promise.resolve();
        }
      });
    };

    await router.executeAsync(
      router.resolveRequest(createRequestOptions('success', FIRST_CWD, {}, 80)),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        registerDisposable(context);
        return { exitCode: 0 };
      },
      new TestGlobalCommandClient()
    );
    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('failure', SECOND_CWD, {}, 80)),
        async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
          registerDisposable(context);
          throw new Error('global command failed');
        },
        new TestGlobalCommandClient()
      )
    ).resolves.toMatchObject({
      errorMessage: 'global command failed',
      exitCode: 1,
      outcome: 'failure'
    });

    expect(requestDisposeCount).toBe(2);
    expect(sessionDisposeCount).toBe(0);
  });

  it('aborts child processes and cleans request resources on cancellation', async () => {
    const processCwd: string = process.cwd();
    const processEnvironmentValue: string | undefined = process.env.RUSHD_CONTEXT_TEST;
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    const killProcessTreeSpy: jest.SpyInstance = jest.spyOn(
      SubprocessTerminator,
      'killProcessTree'
    );
    const killProcessTreeOnExitSpy: jest.SpyInstance = jest.spyOn(
      SubprocessTerminator,
      'killProcessTreeOnExit'
    );
    let resourceDisposed: boolean = false;
    let markChildStarted: (() => void) | undefined;
    const childStarted: Promise<void> = new Promise((resolve) => {
      markChildStarted = resolve;
    });
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      router.resolveRequest(
        createRequestOptions('cancelled', FIRST_CWD, { RUSHD_CONTEXT_TEST: 'child' }, 80)
      ),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        context.registerDisposable({
          [Symbol.asyncDispose]: (): Promise<void> => {
            resourceDisposed = true;
            return Promise.resolve();
          }
        });
        const child = context.spawnChild(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
        child.once('spawn', () => markChildStarted?.());
        await new Promise<void>((resolve) => child.once('close', () => resolve()));
        return { exitCode: 0 };
      },
      client
    );
    try {
      await childStarted;
      client.abortController.abort(new Error('client cancelled'));

      await expect(resultPromise).resolves.toEqual({
        aborted: true,
        errorMessage: undefined,
        exitCode: 1,
        outcome: 'aborted',
        requestId: 'cancelled'
      });
      expect(resourceDisposed).toBe(true);
      expect(killProcessTreeOnExitSpy).toHaveBeenCalledTimes(1);
      expect(killProcessTreeSpy).toHaveBeenCalledTimes(1);
      expect(process.cwd()).toBe(processCwd);
      expect(process.env.RUSHD_CONTEXT_TEST).toBe(processEnvironmentValue);
    } finally {
      killProcessTreeOnExitSpy.mockRestore();
      killProcessTreeSpy.mockRestore();
    }
  });

  it('waits for cooperative executor settlement before completing cancellation', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    let releaseExecutor: (() => void) | undefined;
    let executorSettled: boolean = false;
    const executorRelease: Promise<void> = new Promise((resolve) => {
      releaseExecutor = resolve;
    });
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      router.resolveRequest(createRequestOptions('cooperative-cancel', FIRST_CWD, {}, 80)),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        await waitForAbortAsync(context.abortSignal);
        await executorRelease;
        executorSettled = true;
        return { exitCode: 0 };
      },
      client
    );
    let requestSettled: boolean = false;
    void resultPromise.then(() => {
      requestSettled = true;
    });

    client.abortController.abort();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(requestSettled).toBe(false);
    releaseExecutor?.();

    await expect(resultPromise).resolves.toEqual({
      aborted: true,
      errorMessage: undefined,
      exitCode: 1,
      outcome: 'aborted',
      requestId: 'cooperative-cancel'
    });
    expect(executorSettled).toBe(true);
  });

  it('reports cancellation that arrives during request cleanup', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    let markDisposalStarted: (() => void) | undefined;
    let releaseDisposal: (() => void) | undefined;
    const disposalStarted: Promise<void> = new Promise((resolve) => {
      markDisposalStarted = resolve;
    });
    const disposalRelease: Promise<void> = new Promise((resolve) => {
      releaseDisposal = resolve;
    });
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      router.resolveRequest(createRequestOptions('cleanup-cancel', FIRST_CWD, {}, 80)),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        context.registerDisposable({
          [Symbol.asyncDispose]: async (): Promise<void> => {
            markDisposalStarted?.();
            await disposalRelease;
          }
        });
        return { exitCode: 0 };
      },
      client
    );

    await disposalStarted;
    client.abortController.abort(new Error('client cancelled during cleanup'));
    releaseDisposal?.();

    await expect(resultPromise).resolves.toEqual({
      aborted: true,
      errorMessage: undefined,
      exitCode: 1,
      outcome: 'aborted',
      requestId: 'cleanup-cancel'
    });
  });

  it('preserves cancellation when the executor rejects while aborting', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      router.resolveRequest(createRequestOptions('failed-cancel', FIRST_CWD, {}, 80)),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        await waitForAbortAsync(context.abortSignal);
        throw new Error('executor failed while aborting');
      },
      client
    );

    client.abortController.abort();

    await expect(resultPromise).resolves.toEqual({
      aborted: true,
      errorMessage: 'executor failed while aborting',
      exitCode: 1,
      outcome: 'failure',
      requestId: 'failed-cancel'
    });
  });

  it('preserves a client abort observed during cleanup', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    let releaseCleanup: (() => void) | undefined;
    let markCleanupStarted: (() => void) | undefined;
    const cleanupStarted: Promise<void> = new Promise((resolve) => {
      markCleanupStarted = resolve;
    });
    const cleanupRelease: Promise<void> = new Promise((resolve) => {
      releaseCleanup = resolve;
    });
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      router.resolveRequest(createRequestOptions('cleanup-cancel', FIRST_CWD, {}, 80)),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        context.registerDisposable({
          [Symbol.asyncDispose]: async (): Promise<void> => {
            markCleanupStarted?.();
            await cleanupRelease;
          }
        });
        return { exitCode: 0 };
      },
      client
    );
    await cleanupStarted;
    client.abortController.abort(new Error('client cancelled during cleanup'));
    releaseCleanup?.();

    await expect(resultPromise).resolves.toEqual({
      aborted: true,
      errorMessage: undefined,
      exitCode: 1,
      outcome: 'aborted',
      requestId: 'cleanup-cancel'
    });
  });

  it('preserves a delayed terminal disconnect observed during cleanup', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    let releaseWrite: (() => void) | undefined;
    const writeRelease: Promise<void> = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    client.onWriteAsync = async (): Promise<void> => {
      await writeRelease;
      throw new Error('client disconnected during cleanup');
    };
    let releaseCleanup: (() => void) | undefined;
    let markCleanupStarted: (() => void) | undefined;
    const cleanupStarted: Promise<void> = new Promise((resolve) => {
      markCleanupStarted = resolve;
    });
    const cleanupRelease: Promise<void> = new Promise((resolve) => {
      releaseCleanup = resolve;
    });
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      router.resolveRequest(createRequestOptions('cleanup-disconnect', FIRST_CWD, {}, 80)),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        context.registerDisposable({
          [Symbol.asyncDispose]: async (): Promise<void> => {
            markCleanupStarted?.();
            await cleanupRelease;
          }
        });
        context.terminal.writeLine('pending output');
        return { exitCode: 0 };
      },
      client
    );
    await cleanupStarted;
    releaseWrite?.();
    releaseCleanup?.();

    await expect(resultPromise).resolves.toEqual({
      aborted: true,
      errorMessage: 'client disconnected during cleanup',
      exitCode: 1,
      outcome: 'failure',
      requestId: 'cleanup-disconnect'
    });
  });

  it('continues request cleanup after a disposer throws synchronously', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const disposalOrder: string[] = [];

    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('cleanup-errors', FIRST_CWD, {}, 80)),
        async (
          context: IGlobalCommandExecutionContext
        ): Promise<IGlobalCommandExecutionResult> => {
          context.registerDisposable(createRecordingDisposable('first', disposalOrder));
          context.registerDisposable({
            [Symbol.asyncDispose]: (): Promise<void> => {
              disposalOrder.push('throwing');
              throw new Error('synchronous cleanup failure');
            }
          });
          context.registerDisposable(createRecordingDisposable('last', disposalOrder));
          return { exitCode: 0 };
        },
        new TestGlobalCommandClient()
      )
    ).resolves.toMatchObject({
      errorMessage: 'synchronous cleanup failure',
      exitCode: 1,
      outcome: 'failure'
    });
    expect(disposalOrder).toEqual(['last', 'throwing', 'first']);
  });

  it('surfaces disconnect write failures after deterministic cleanup', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    let resourceDisposed: boolean = false;
    client.onWriteAsync = (): Promise<void> => Promise.reject(new Error('client disconnected'));
    client.onResultAsync = (): Promise<void> => Promise.reject(new Error('client disconnected'));

    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('disconnect', FIRST_CWD, {}, 80)),
        async (
          context: IGlobalCommandExecutionContext
        ): Promise<IGlobalCommandExecutionResult> => {
          context.registerDisposable({
            [Symbol.asyncDispose]: (): Promise<void> => {
              resourceDisposed = true;
              return Promise.resolve();
            }
          });
          context.terminal.writeLine('disconnect');
          await waitForAbortAsync(context.abortSignal);
          return { exitCode: 0 };
        },
        client
      )
    ).rejects.toThrow('client disconnected');
    expect(resourceDisposed).toBe(true);
  });

  it('rejects invalid or cross-workspace resolved requests before execution', async () => {
    const firstRouter: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const secondRouter: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    expect(() =>
      firstRouter.resolveRequest(createRequestOptions('outside', path.dirname(TEST_REPO_ROOT), {}, 80))
    ).toThrow('outside the daemon workspace');
    expect(() =>
      firstRouter.resolveRequest(createRequestOptions('columns', FIRST_CWD, {}, 0))
    ).toThrow('positive safe integer');
    const request: IResolvedGlobalCommandRequest = firstRouter.resolveRequest(
      createRequestOptions('first-workspace', FIRST_CWD, {}, 80)
    );
    const executor: jest.Mock<
      Promise<IGlobalCommandExecutionResult>,
      [IGlobalCommandExecutionContext]
    > = jest.fn(
      (context: IGlobalCommandExecutionContext) => {
        void context;
        return Promise.resolve({ exitCode: 0 });
      }
    );

    await expect(
      secondRouter.executeAsync(request, executor, new TestGlobalCommandClient())
    ).rejects.toThrow('not resolved for this workspace session');
    expect(executor).not.toHaveBeenCalled();
  });

  it('forwards raw stdin bytes to an injected child process with backpressure', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    const inputRouter: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const requestId: string = 'child-input';
    client.interactiveSession = inputRouter.register({
      acceptsStdin: true,
      client: {
        abortSignal: client.abortSignal,
        writeRawModeControlAsync: (): Promise<void> => Promise.resolve()
      },
      onFailure: (error: Error) => client.abortController.abort(error),
      requestId
    });
    const options: IResolveGlobalCommandRequestOptions = createRequestOptions(
      requestId,
      FIRST_CWD,
      {},
      80
    );
    const request: IResolvedGlobalCommandRequest = router.resolveRequest({
      ...options,
      terminal: { ...options.terminal, acceptsStdin: true }
    });
    let markChildStarted: (() => void) | undefined;
    const childStarted: Promise<void> = new Promise((resolve) => {
      markChildStarted = resolve;
    });
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      request,
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        const child = context.spawnChild(
          process.execPath,
          ['-e', "process.stdin.once('data',b=>{process.stdout.write(Buffer.from(b).toString('hex'));process.exit(0)})"],
          { forwardInput: true }
        );
        child.once('spawn', () => markChildStarted?.());
        await new Promise<void>((resolve) => child.once('close', () => resolve()));
        return { exitCode: 0 };
      },
      client
    );
    await childStarted;
    const inputBytes: Uint8Array = Uint8Array.of(0xff, 0x00, 0x80);
    await inputRouter.routeStdinFrameAsync(encodeDaemonStdinChunk({ chunk: inputBytes, requestId }));
    await resultPromise;

    expect(client.chunks.map(({ text }) => text).join('')).toBe('ff0080');
  });

  it('restores raw mode after output drain and before the final result', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    const lifecycleOrder: string[] = [];
    const inputRouter: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const requestId: string = 'raw-lifecycle';
    client.interactiveSession = inputRouter.register({
      acceptsStdin: true,
      client: {
        abortSignal: client.abortSignal,
        writeRawModeControlAsync: (message: IDaemonSetRawModeMessage): Promise<void> => {
          lifecycleOrder.push(`raw:${message.payload.enabled}`);
          return Promise.resolve();
        }
      },
      onFailure: (error: Error) => client.abortController.abort(error),
      requestId
    });
    client.onWriteAsync = async (): Promise<void> => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      lifecycleOrder.push('output');
    };
    client.onResultAsync = (): Promise<void> => {
      lifecycleOrder.push('result');
      return Promise.resolve();
    };
    const options: IResolveGlobalCommandRequestOptions = createRequestOptions(
      requestId,
      FIRST_CWD,
      {},
      80
    );

    await router.executeAsync(
      router.resolveRequest({
        ...options,
        terminal: { ...options.terminal, acceptsStdin: true }
      }),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        await context.interactiveInput?.setRawModeAsync(true);
        context.terminal.writeLine('prompt');
        return { exitCode: 0 };
      },
      client
    );

    expect(lifecycleOrder).toEqual(['raw:true', 'output', 'raw:false', 'result']);
  });

  it('rejects interactive input requirements without stdin capability', () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const options: IResolveGlobalCommandRequestOptions = createRequestOptions(
      'invalid-interactive-input',
      FIRST_CWD,
      {},
      80
    );

    expect(() =>
      router.resolveRequest({
        ...options,
        terminal: { ...options.terminal, terminalRequirement: 'interactiveInput' }
      })
    ).toThrow('requires acceptsStdin');
  });

  it('signals typed in-process fallback without executing a PTY-only command', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    const executor: jest.Mock<Promise<IGlobalCommandExecutionResult>, [IGlobalCommandExecutionContext]> =
      jest.fn(async (context: IGlobalCommandExecutionContext) => {
        void context;
        return { exitCode: 0 };
      });
    const options: IResolveGlobalCommandRequestOptions = createRequestOptions(
      'pty-only',
      FIRST_CWD,
      {},
      80
    );

    await expect(
      router.executeAsync(
        router.resolveRequest({
          ...options,
          terminal: { ...options.terminal, terminalRequirement: 'controllingTerminal' }
        }),
        executor,
        client
      )
    ).rejects.toBeInstanceOf(DaemonRequiresInProcessError);
    expect(client.policies).toEqual([
      {
        decision: 'requiresInProcess',
        reason: 'controllingTerminalRequired',
        requestId: 'pty-only'
      }
    ]);
    expect(executor).not.toHaveBeenCalled();
    expect(client.results).toHaveLength(0);
  });
});
