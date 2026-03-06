// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { OperationStatus } from '../OperationStatus.ts';
import { type IWatchLoopOptions, type IWatchLoopState, WatchLoop } from '../WatchLoop.ts';
import type {
  CommandMessageFromHost,
  EventMessageFromClient,
  IAfterExecuteEventMessage,
  IPCHost,
  ISyncEventMessage
} from '../protocol.types.ts';

type IMockOptions = {
  [K in keyof IWatchLoopOptions]: jest.Mock<
    ReturnType<IWatchLoopOptions[K]>,
    Parameters<IWatchLoopOptions[K]>
  >;
};

interface IMockOptionsAndWatchLoop {
  watchLoop: WatchLoop;
  mocks: IMockOptions;
}

function createWatchLoop(): IMockOptionsAndWatchLoop {
  const mocks = {
    executeAsync: jest.fn(),
    onBeforeExecute: jest.fn(),
    onRequestRun: jest.fn(),
    onAbort: jest.fn()
  };

  return {
    watchLoop: new WatchLoop(mocks),
    mocks
  };
}

describe(WatchLoop.name, () => {
  describe(WatchLoop.prototype.runUntilStableAsync.name, () => {
    it('executes once when no run is requested', async () => {
      const {
        watchLoop,
        mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
      } = createWatchLoop();

      const outerAbortController: AbortController = new AbortController();

      await watchLoop.runUntilStableAsync(outerAbortController.signal);

      expect(onBeforeExecute).toHaveBeenCalledTimes(1);
      expect(executeAsync).toHaveBeenCalledTimes(1);
      expect(onRequestRun).toHaveBeenCalledTimes(0);
      expect(onAbort).toHaveBeenCalledTimes(0);
    });

    it('will abort and re-execute if a run is requested while executing', async () => {
      const {
        watchLoop,
        mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
      } = createWatchLoop();

      let iteration: number = 0;
      const maxIterations: number = 5;

      const outerAbortController: AbortController = new AbortController();

      executeAsync.mockImplementation(async (state: IWatchLoopState) => {
        iteration++;
        if (iteration < maxIterations) {
          state.requestRun('test');
          return OperationStatus.Success;
        }
        return OperationStatus.NoOp;
      });

      expect(await watchLoop.runUntilStableAsync(outerAbortController.signal)).toEqual(OperationStatus.NoOp);

      expect(onBeforeExecute).toHaveBeenCalledTimes(maxIterations);
      expect(executeAsync).toHaveBeenCalledTimes(maxIterations);
      expect(onRequestRun).toHaveBeenCalledTimes(maxIterations - 1);
      expect(onAbort).toHaveBeenCalledTimes(maxIterations - 1);
    });

    it('will abort if the outer signal is aborted', async () => {
      const {
        watchLoop,
        mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
      } = createWatchLoop();

      let iteration: number = 0;
      const cancelIterations: number = 3;
      const maxIterations: number = 5;

      const outerAbortController: AbortController = new AbortController();

      executeAsync.mockImplementation(async (state: IWatchLoopState) => {
        iteration++;
        if (iteration < maxIterations) {
          state.requestRun('test', 'some detail');
        }
        if (iteration === cancelIterations) {
          outerAbortController.abort();
        }
        return OperationStatus.Failure;
      });

      expect(await watchLoop.runUntilStableAsync(outerAbortController.signal)).toEqual(
        OperationStatus.Aborted
      );

      expect(onBeforeExecute).toHaveBeenCalledTimes(cancelIterations);
      expect(executeAsync).toHaveBeenCalledTimes(cancelIterations);
      expect(onRequestRun).toHaveBeenCalledTimes(cancelIterations);
      expect(onRequestRun).toHaveBeenLastCalledWith('test', 'some detail');
      expect(onAbort).toHaveBeenCalledTimes(cancelIterations);
    });

    it('will abort if an unhandled exception arises', async () => {
      const {
        watchLoop,
        mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
      } = createWatchLoop();

      let iteration: number = 0;
      const exceptionIterations: number = 3;
      const maxIterations: number = 5;

      const outerAbortController: AbortController = new AbortController();

      executeAsync.mockImplementation(async (state: IWatchLoopState) => {
        iteration++;
        if (iteration < maxIterations) {
          state.requestRun('test', 'reason');
        }
        if (iteration === exceptionIterations) {
          throw new Error('fnord');
        }
        return OperationStatus.Success;
      });

      await expect(() => watchLoop.runUntilStableAsync(outerAbortController.signal)).rejects.toThrow('fnord');

      expect(onBeforeExecute).toHaveBeenCalledTimes(exceptionIterations);
      expect(executeAsync).toHaveBeenCalledTimes(exceptionIterations);
      expect(onRequestRun).toHaveBeenCalledTimes(exceptionIterations);
      expect(onRequestRun).toHaveBeenLastCalledWith('test', 'reason');
      expect(onAbort).toHaveBeenCalledTimes(exceptionIterations);
    });
  });

  it('treats AlreadyReportedError as generic failure', async () => {
    const {
      watchLoop,
      mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
    } = createWatchLoop();

    const outerAbortController: AbortController = new AbortController();

    executeAsync.mockImplementation(async (state: IWatchLoopState) => {
      throw new AlreadyReportedError();
    });

    expect(await watchLoop.runUntilStableAsync(outerAbortController.signal)).toEqual(OperationStatus.Failure);

    expect(onBeforeExecute).toHaveBeenCalledTimes(1);
    expect(executeAsync).toHaveBeenCalledTimes(1);
    expect(onRequestRun).toHaveBeenCalledTimes(0);
    expect(onAbort).toHaveBeenCalledTimes(0);
  });

  describe(WatchLoop.prototype.runUntilAbortedAsync.name, () => {
    it('will abort if an unhandled exception arises', async () => {
      const {
        watchLoop,
        mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
      } = createWatchLoop();

      let iteration: number = 0;
      const exceptionIterations: number = 3;
      const maxIterations: number = 5;

      const onWaiting: jest.Mock<void, []> = jest.fn();

      const outerAbortController: AbortController = new AbortController();

      executeAsync.mockImplementation(async (state: IWatchLoopState) => {
        iteration++;
        if (iteration < maxIterations) {
          state.requestRun('test', 'why');
        }
        if (iteration === exceptionIterations) {
          throw new Error('fnord');
        }
        return OperationStatus.Success;
      });

      await expect(() =>
        watchLoop.runUntilAbortedAsync(outerAbortController.signal, onWaiting)
      ).rejects.toThrow('fnord');

      expect(onBeforeExecute).toHaveBeenCalledTimes(exceptionIterations);
      expect(executeAsync).toHaveBeenCalledTimes(exceptionIterations);
      expect(onRequestRun).toHaveBeenCalledTimes(exceptionIterations);
      expect(onRequestRun).toHaveBeenLastCalledWith('test', 'why');
      expect(onAbort).toHaveBeenCalledTimes(exceptionIterations);
      expect(onWaiting).toHaveBeenCalledTimes(0);
    });

    it('will wait if not immediately ready', async () => {
      const {
        watchLoop,
        mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
      } = createWatchLoop();

      let iteration: number = 0;
      const cancelIterations: number = 3;
      const maxIterations: number = 5;

      const onWaiting: jest.Mock<void, []> = jest.fn();
      const promises: Promise<void>[] = [];

      const outerAbortController: AbortController = new AbortController();

      executeAsync.mockImplementation(async (state: IWatchLoopState) => {
        iteration++;
        if (iteration < maxIterations) {
          promises.push(
            new Promise((resolve) => setTimeout(resolve, 0)).then(() => state.requestRun('test'))
          );
        }
        if (iteration === cancelIterations) {
          outerAbortController.abort();
        }
        return OperationStatus.Success;
      });

      await watchLoop.runUntilAbortedAsync(outerAbortController.signal, onWaiting);

      expect(onBeforeExecute).toHaveBeenCalledTimes(cancelIterations);
      expect(executeAsync).toHaveBeenCalledTimes(cancelIterations);
      expect(onRequestRun).toHaveBeenLastCalledWith('test', undefined);

      // Since the run finishes, no cancellation should occur
      expect(onAbort).toHaveBeenCalledTimes(0);
      expect(onWaiting).toHaveBeenCalledTimes(cancelIterations);

      // Canceling of the outer signal happens before requestRun on the final iteration
      expect(onRequestRun).toHaveBeenCalledTimes(cancelIterations - 1);

      await Promise.all(promises);
      // Final iteration async
      expect(onRequestRun).toHaveBeenCalledTimes(cancelIterations);
    });
  });

  describe(WatchLoop.prototype.runIPCAsync.name, () => {
    it('messsages the host with finished state', async () => {
      const {
        watchLoop,
        mocks: { executeAsync, onBeforeExecute, onRequestRun, onAbort }
      } = createWatchLoop();

      const onMock: jest.Mock = jest.fn();
      const sendMock: jest.Mock = jest.fn();

      let messageHandler: ((message: CommandMessageFromHost) => void) | undefined;

      onMock.mockImplementationOnce((event: string, handler: (message: CommandMessageFromHost) => void) => {
        if (event !== 'message') {
          throw new Error(`Unexpected event type: ${event}`);
        }
        messageHandler = handler;
      });

      sendMock.mockImplementation((message: EventMessageFromClient) => {
        if (message.event === 'sync') {
          process.nextTick(() => messageHandler!({ command: 'run' }));
        } else {
          process.nextTick(() => messageHandler!({ command: 'exit' }));
        }
      });

      const ipcHost: IPCHost = {
        on: onMock,
        send: sendMock
      };

      executeAsync.mockImplementation(async (state: IWatchLoopState) => {
        return OperationStatus.Success;
      });

      await watchLoop.runIPCAsync(ipcHost);

      expect(onBeforeExecute).toHaveBeenCalledTimes(1);
      expect(executeAsync).toHaveBeenCalledTimes(1);
      expect(onRequestRun).toHaveBeenCalledTimes(0);
      expect(onAbort).toHaveBeenCalledTimes(0);

      expect(onMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledTimes(2);

      const syncMessage: ISyncEventMessage = {
        event: 'sync',
        status: OperationStatus.Ready
      };

      const successMessage: IAfterExecuteEventMessage = {
        event: 'after-execute',
        status: OperationStatus.Success
      };

      expect(sendMock).toHaveBeenCalledWith(syncMessage);
      expect(sendMock).toHaveBeenLastCalledWith(successMessage);
    });
  });
});
