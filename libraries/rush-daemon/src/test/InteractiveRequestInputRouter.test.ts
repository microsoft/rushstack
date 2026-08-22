// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { encodeDaemonStdinChunk } from '@rushstack/rush-daemon-protocol';
import type { IDaemonSetRawModeMessage } from '@rushstack/rush-daemon-protocol';

import { InteractiveRequestInputRouter } from '../InteractiveRequestInputRouter';
import type {
  IInteractiveRequestControlClient,
  IInteractiveRequestInputSink,
  IInteractiveRequestSession
} from '../InteractiveRequestInputRouter';

class TestControlClient implements IInteractiveRequestControlClient {
  public readonly abortController: AbortController = new AbortController();
  public readonly controls: IDaemonSetRawModeMessage[] = [];
  public onControlAsync: ((message: IDaemonSetRawModeMessage) => Promise<void>) | undefined;

  public get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public async writeRawModeControlAsync(message: IDaemonSetRawModeMessage): Promise<void> {
    this.controls.push(message);
    await this.onControlAsync?.(message);
  }
}

function register(
  router: InteractiveRequestInputRouter,
  requestId: string,
  client: TestControlClient,
  acceptsStdin: boolean = true
): { failures: Error[]; session: IInteractiveRequestSession } {
  const failures: Error[] = [];
  const session: IInteractiveRequestSession = router.register({
    acceptsStdin,
    client,
    onFailure: (error: Error) => failures.push(error),
    requestId
  });
  return { failures, session };
}

function routeAsync(
  router: InteractiveRequestInputRouter,
  requestId: string,
  chunk: Uint8Array
): Promise<void> {
  return router.routeStdinFrameAsync(encodeDaemonStdinChunk({ chunk, requestId }));
}

describe(InteractiveRequestInputRouter.name, () => {
  it('backpressures stdin that arrives before its input sink is attached', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const session: IInteractiveRequestSession = register(
      router,
      'sink-race',
      new TestControlClient()
    ).session;
    const writes: Uint8Array[] = [];
    let settled: boolean = false;
    const writePromise: Promise<void> = routeAsync(router, 'sink-race', Uint8Array.of(1));
    void writePromise.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    session.attachInputSink({
      writeInputAsync: (chunk: Uint8Array): Promise<void> => {
        writes.push(chunk);
        return Promise.resolve();
      }
    });
    await writePromise;
    expect(writes).toEqual([Uint8Array.of(1)]);
  });

  it('preserves bytes and ordered backpressure without cross-request blocking', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const first = register(router, 'first', new TestControlClient()).session;
    const second = register(router, 'second', new TestControlClient()).session;
    const writes: string[] = [];
    let releaseFirst: (() => void) | undefined;
    first.attachInputSink({
      writeInputAsync: async (chunk: Uint8Array): Promise<void> => {
        writes.push(`first:${Buffer.from(chunk).toString('hex')}`);
        if (writes.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
      }
    });
    second.attachInputSink({
      writeInputAsync: (chunk: Uint8Array): Promise<void> => {
        writes.push(`second:${Buffer.from(chunk).toString('hex')}`);
        return Promise.resolve();
      }
    });

    const firstWrite: Promise<void> = routeAsync(router, 'first', Uint8Array.of(0xff, 0x80));
    const queuedFirstWrite: Promise<void> = routeAsync(router, 'first', Uint8Array.of(0x00));
    await routeAsync(router, 'second', Uint8Array.of(0x7f));
    expect(writes).toEqual(['first:ff80', 'second:7f']);
    releaseFirst?.();
    await Promise.all([firstWrite, queuedFirstWrite]);
    expect(writes).toEqual(['first:ff80', 'second:7f', 'first:00']);
  });

  it('rejects unknown, non-interactive, aborted, and completed request input', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    await expect(routeAsync(router, 'missing', Uint8Array.of(1))).rejects.toMatchObject({
      code: 'unknownRequest'
    });
    const nonInteractive = register(router, 'plain', new TestControlClient(), false).session;
    await expect(routeAsync(router, 'plain', Uint8Array.of(1))).rejects.toMatchObject({
      code: 'nonInteractiveRequest'
    });
    await nonInteractive.finishAsync();
    const client: TestControlClient = new TestControlClient();
    const interactive: IInteractiveRequestSession = register(router, 'active', client).session;
    interactive.attachInputSink({ writeInputAsync: (): Promise<void> => Promise.resolve() });
    client.abortController.abort();
    await expect(routeAsync(router, 'active', Uint8Array.of(1))).rejects.toMatchObject({
      code: 'completedRequest'
    });
    await interactive.finishAsync();
  });

  it('serializes raw-mode transitions and restores cooked mode before finishing', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const client: TestControlClient = new TestControlClient();
    const session: IInteractiveRequestSession = register(router, 'raw', client).session;

    await session.setRawModeAsync(true);
    await session.finishAsync();

    expect(client.controls.map(({ payload }) => payload)).toEqual([
      { enabled: true, requestId: 'raw' },
      { enabled: false, requestId: 'raw' }
    ]);
  });

  it('restores cooked mode after cancellation races request cleanup', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const client: TestControlClient = new TestControlClient();
    const session: IInteractiveRequestSession = register(router, 'abort-raw', client).session;
    await session.setRawModeAsync(true);

    client.abortController.abort(new Error('connection closed'));
    await session.finishAsync();

    expect(client.controls.map(({ payload }) => payload.enabled)).toEqual([true, false]);
  });

  it('does not deliver queued stdin after cancellation', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const client: TestControlClient = new TestControlClient();
    const session: IInteractiveRequestSession = register(router, 'queued-abort', client).session;
    const writes: number[] = [];
    let releaseFirst: (() => void) | undefined;
    session.attachInputSink({
      writeInputAsync: async (chunk: Uint8Array): Promise<void> => {
        writes.push(chunk[0]);
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
    });
    const firstWrite: Promise<void> = routeAsync(router, 'queued-abort', Uint8Array.of(1));
    const secondWrite: Promise<void> = routeAsync(router, 'queued-abort', Uint8Array.of(2));
    await Promise.resolve();
    client.abortController.abort();
    releaseFirst?.();

    await firstWrite;
    await expect(secondWrite).rejects.toMatchObject({ code: 'completedRequest' });
    await session.finishAsync();
    expect(writes).toEqual([1]);
  });

  it('attempts raw-mode restoration after a control write failure', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const client: TestControlClient = new TestControlClient();
    client.onControlAsync = ({ payload }): Promise<void> =>
      payload.enabled ? Promise.reject(new Error('raw mode write failed')) : Promise.resolve();
    const { failures, session } = register(router, 'raw-failure', client);

    await expect(session.setRawModeAsync(true)).rejects.toThrow('raw mode write failed');
    await expect(session.finishAsync()).rejects.toThrow('raw mode write failed');

    expect(client.controls.map(({ payload }) => payload.enabled)).toEqual([true, false]);
    expect(failures).toHaveLength(1);
  });

  it('stops a request after an input write failure and reports it once', async () => {
    const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    const { failures, session } = register(router, 'write-failure', new TestControlClient());
    const sink: IInteractiveRequestInputSink = {
      writeInputAsync: (): Promise<void> => Promise.reject(new Error('stdin closed'))
    };
    session.attachInputSink(sink);

    await expect(routeAsync(router, 'write-failure', Uint8Array.of(1))).rejects.toThrow('stdin closed');
    await expect(routeAsync(router, 'write-failure', Uint8Array.of(2))).rejects.toThrow('completedRequest');
    await expect(session.finishAsync()).rejects.toThrow('stdin closed');
    expect(failures).toHaveLength(1);
  });
});
