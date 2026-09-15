// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { encodeDaemonStdinChunk } from '@rushstack/rush-daemon-protocol';

import {
  InteractiveRequestInputRouter,
  type IInteractiveRequestInputSink,
  type IInteractiveRequestSession
} from '../InteractiveRequestInputRouter';
import { createDeferred } from './DaemonRequestWireTestUtilities';

const REQUEST_ID: string = 'input-end';

describe('request input admission and EOF', () => {
  let router: InteractiveRequestInputRouter;
  let abort: AbortController;
  let onFailure: jest.Mock;
  let ready: jest.Mock;
  let session: IInteractiveRequestSession;

  beforeEach(() => {
    router = new InteractiveRequestInputRouter();
    abort = new AbortController();
    onFailure = jest.fn();
    ready = jest.fn(async () => {});
    session = router.register({
      acceptsStdin: true,
      requestId: REQUEST_ID,
      onFailure,
      client: {
        abortSignal: abort.signal,
        writeRawModeControlAsync: async () => {},
        writeInputReadyAsync: ready
      }
    });
  });

  it('announces an attached sink and delivers EOF after all preceding bytes', async () => {
    const writing = createDeferred<void>();
    const written = createDeferred<void>();
    const events: string[] = [];
    const sink: IInteractiveRequestInputSink = {
      writeInputAsync: async (chunk) => {
        events.push(Buffer.from(chunk).toString('hex'));
        writing.resolve();
        await written.promise;
      },
      endInputAsync: async () => { events.push('EOF'); }
    };
    expect(ready).not.toHaveBeenCalled();
    session.attachInputSink(sink);
    const input: Promise<void> = router.routeStdinFrameAsync(encodeDaemonStdinChunk({
      requestId: REQUEST_ID,
      chunk: Uint8Array.of(0, 3, 255)
    }));
    await writing.promise;
    expect(ready).toHaveBeenCalledWith(REQUEST_ID);
    const eof: Promise<void> = router.routeStdinEndAsync(REQUEST_ID);
    expect(events).toEqual(['0003ff']);
    await expect(router.routeStdinFrameAsync(encodeDaemonStdinChunk({
      requestId: REQUEST_ID,
      chunk: Uint8Array.of(1)
    }))).rejects.toMatchObject({ code: 'inputEnded' });
    expect(() => router.routeStdinEndAsync(REQUEST_ID)).toThrow('inputEnded');
    written.resolve();
    await Promise.all([input, eof]);
    await session.finishAsync();
    expect(events).toEqual(['0003ff', 'EOF']);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('delivers empty input as EOF rather than a fabricated zero-length data write', async () => {
    const writeInputAsync = jest.fn(async () => {});
    const endInputAsync = jest.fn(async () => {});
    session.attachInputSink({ writeInputAsync, endInputAsync });
    await router.routeStdinEndAsync(REQUEST_ID);
    await session.finishAsync();
    expect(writeInputAsync).not.toHaveBeenCalled();
    expect(endInputAsync).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('cancels EOF waiting for an input sink without blocking request cleanup', async () => {
    const eof: Promise<void> = router.routeStdinEndAsync(REQUEST_ID);
    const rejected: Promise<void> = expect(eof).rejects.toMatchObject({ code: 'completedRequest' });
    abort.abort();
    await rejected;
    await session.finishAsync();
    expect(ready).not.toHaveBeenCalled();
  });

  it('surfaces a destination that cannot accept EOF', async () => {
    session.attachInputSink({ writeInputAsync: async () => {} });
    await expect(router.routeStdinEndAsync(REQUEST_ID)).rejects.toThrow('does not support EOF');
    await expect(session.finishAsync()).rejects.toThrow('does not support EOF');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed admission write through request cleanup', async () => {
    ready.mockRejectedValue(new Error('admission output failed'));
    session.attachInputSink({ writeInputAsync: async () => {}, endInputAsync: async () => {} });
    await expect(session.finishAsync()).rejects.toThrow('admission output failed');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
