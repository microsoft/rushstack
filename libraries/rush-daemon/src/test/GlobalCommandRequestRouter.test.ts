// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { SubprocessTerminator } from '@rushstack/node-core-library';

import type { IGlobalCommandExecutionContext } from '../GlobalCommandExecutionContext';
import type {
  IResolvedGlobalCommandRequest,
  IResolveGlobalCommandRequestOptions
} from '../GlobalCommandRequest';
import type { IGlobalCommandRequestClient } from '../GlobalCommandRequestClient';
import {
  GlobalCommandRequestRouter,
  type IGlobalCommandRequestResult
} from '../GlobalCommandRequestRouter';
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
  public onWriteAsync: ((chunk: IClientChunk) => Promise<void>) | undefined;

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
        async (context: IGlobalCommandExecutionContext): Promise<void> => {
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
      { aborted: false, requestId: 'first' },
      { aborted: false, requestId: 'second' }
    ]);
    expect(new Set(observations)).toEqual(
      new Set([
        `${getCanonicalPath(FIRST_CWD)}|first|80|false`,
        `${getCanonicalPath(SECOND_CWD)}|second|160|true`
      ])
    );
    expect(firstClient.chunks.map(({ text }) => text).join('')).toContain('first');
    expect(secondClient.chunks.map(({ text }) => text).join('')).toContain('second');
    expect(process.cwd()).toBe(processCwd);
    expect(process.env.RUSHD_CONTEXT_TEST).toBe(processEnvironmentValue);
  });

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
      async (context: IGlobalCommandExecutionContext): Promise<void> => {
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
        await new Promise<void>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', () => resolve());
        });
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
      async (context: IGlobalCommandExecutionContext): Promise<void> => registerDisposable(context),
      new TestGlobalCommandClient()
    );
    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('failure', SECOND_CWD, {}, 80)),
        async (context: IGlobalCommandExecutionContext): Promise<void> => {
          registerDisposable(context);
          throw new Error('global command failed');
        },
        new TestGlobalCommandClient()
      )
    ).rejects.toThrow('global command failed');

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
    let resourceDisposed: boolean = false;
    let markChildStarted: (() => void) | undefined;
    const childStarted: Promise<void> = new Promise((resolve) => {
      markChildStarted = resolve;
    });
    const resultPromise: Promise<IGlobalCommandRequestResult> = router.executeAsync(
      router.resolveRequest(
        createRequestOptions('cancelled', FIRST_CWD, { RUSHD_CONTEXT_TEST: 'child' }, 80)
      ),
      async (context: IGlobalCommandExecutionContext): Promise<void> => {
        context.registerDisposable({
          [Symbol.asyncDispose]: (): Promise<void> => {
            resourceDisposed = true;
            return Promise.resolve();
          }
        });
        const child = context.spawnChild(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
        child.once('spawn', () => markChildStarted?.());
        await new Promise<void>((resolve) => child.once('close', () => resolve()));
      },
      client
    );
    await childStarted;
    client.abortController.abort(new Error('client cancelled'));

    await expect(resultPromise).resolves.toEqual({ aborted: true, requestId: 'cancelled' });
    expect(resourceDisposed).toBe(true);
    expect(killProcessTreeSpy).toHaveBeenCalledTimes(1);
    expect(process.cwd()).toBe(processCwd);
    expect(process.env.RUSHD_CONTEXT_TEST).toBe(processEnvironmentValue);
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
      async (context: IGlobalCommandExecutionContext): Promise<void> => {
        await waitForAbortAsync(context.abortSignal);
        await executorRelease;
        executorSettled = true;
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
      requestId: 'cooperative-cancel'
    });
    expect(executorSettled).toBe(true);
  });

  it('continues request cleanup after a disposer throws synchronously', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const disposalOrder: string[] = [];

    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('cleanup-errors', FIRST_CWD, {}, 80)),
        async (context: IGlobalCommandExecutionContext): Promise<void> => {
          context.registerDisposable(createRecordingDisposable('first', disposalOrder));
          context.registerDisposable({
            [Symbol.asyncDispose]: (): Promise<void> => {
              disposalOrder.push('throwing');
              throw new Error('synchronous cleanup failure');
            }
          });
          context.registerDisposable(createRecordingDisposable('last', disposalOrder));
        },
        new TestGlobalCommandClient()
      )
    ).rejects.toThrow('synchronous cleanup failure');
    expect(disposalOrder).toEqual(['last', 'throwing', 'first']);
  });

  it('surfaces disconnect write failures after deterministic cleanup', async () => {
    const session: TestWorkspaceSession = new TestWorkspaceSession(TEST_REPO_ROOT);
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(session);
    const client: TestGlobalCommandClient = new TestGlobalCommandClient();
    let resourceDisposed: boolean = false;
    client.onWriteAsync = (): Promise<void> => Promise.reject(new Error('client disconnected'));

    await expect(
      router.executeAsync(
        router.resolveRequest(createRequestOptions('disconnect', FIRST_CWD, {}, 80)),
        async (context: IGlobalCommandExecutionContext): Promise<void> => {
          context.registerDisposable({
            [Symbol.asyncDispose]: (): Promise<void> => {
              resourceDisposed = true;
              return Promise.resolve();
            }
          });
          context.terminal.writeLine('disconnect');
          await waitForAbortAsync(context.abortSignal);
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
    const executor: jest.Mock<Promise<void>, [IGlobalCommandExecutionContext]> = jest.fn(
      (context: IGlobalCommandExecutionContext) => {
        void context;
        return Promise.resolve();
      }
    );

    await expect(
      secondRouter.executeAsync(request, executor, new TestGlobalCommandClient())
    ).rejects.toThrow('not resolved for this workspace session');
    expect(executor).not.toHaveBeenCalled();
  });
});
