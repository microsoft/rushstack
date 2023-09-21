// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminal, StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';
import { Operation } from '../Operation';
import { OperationExecutionManager } from '../OperationExecutionManager';
import { OperationStatus } from '../OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';

type ExecuteAsyncMock = jest.Mock<
  ReturnType<IOperationRunner['executeAsync']>,
  Parameters<IOperationRunner['executeAsync']>
>;

describe(OperationExecutionManager.name, () => {
  describe('constructor', () => {
    it('handles empty input', () => {
      const manager: OperationExecutionManager = new OperationExecutionManager(new Set());

      expect(manager).toBeDefined();
    });

    it('throws if a dependency is not in the set', () => {
      const alpha: Operation = new Operation({
        name: 'alpha'
      });
      const beta: Operation = new Operation({
        name: 'beta'
      });

      alpha.addDependency(beta);

      expect(() => {
        return new OperationExecutionManager(new Set([alpha]));
      }).toThrowErrorMatchingSnapshot();
    });

    it('sets critical path lengths', () => {
      const alpha: Operation = new Operation({
        name: 'alpha'
      });
      const beta: Operation = new Operation({
        name: 'beta'
      });

      alpha.addDependency(beta);

      new OperationExecutionManager(new Set([alpha, beta]));

      expect(alpha.criticalPathLength).toBe(1);
      expect(beta.criticalPathLength).toBe(2);
    });
  });

  describe(OperationExecutionManager.prototype.executeAsync.name, () => {
    describe('single pass', () => {
      it('handles empty input', async () => {
        const manager: OperationExecutionManager = new OperationExecutionManager(new Set());

        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
        const terminal: ITerminal = new Terminal(terminalProvider);

        const result: OperationStatus = await manager.executeAsync({
          abortSignal: new AbortController().signal,
          parallelism: 1,
          terminal
        });

        expect(result).toBe(OperationStatus.NoOp);
        expect(terminalProvider.getOutput()).toMatchSnapshot();
      });

      it('handles trivial input', async () => {
        const operation: Operation = new Operation({
          name: 'alpha'
        });
        const manager: OperationExecutionManager = new OperationExecutionManager(new Set([operation]));

        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
        const terminal: ITerminal = new Terminal(terminalProvider);

        const result: OperationStatus = await manager.executeAsync({
          abortSignal: new AbortController().signal,
          parallelism: 1,
          terminal
        });

        expect(result).toBe(OperationStatus.Success);
        expect(terminalProvider.getOutput()).toMatchSnapshot();

        expect(operation.state?.status).toBe(OperationStatus.NoOp);
      });

      it('executes in order', async () => {
        const runAlpha: ExecuteAsyncMock = jest.fn();
        const runBeta: ExecuteAsyncMock = jest.fn();

        const alpha: Operation = new Operation({
          name: 'alpha',
          runner: {
            name: 'alpha',
            executeAsync: runAlpha,
            silent: false
          }
        });
        const beta: Operation = new Operation({
          name: 'beta',
          runner: {
            name: 'alpha',
            executeAsync: runBeta,
            silent: false
          }
        });
        beta.addDependency(alpha);
        const manager: OperationExecutionManager = new OperationExecutionManager(new Set([alpha, beta]));

        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
        const terminal: ITerminal = new Terminal(terminalProvider);

        runAlpha.mockImplementationOnce(async () => {
          expect(runBeta).not.toHaveBeenCalled();
          return OperationStatus.Success;
        });

        runBeta.mockImplementationOnce(async () => {
          expect(runAlpha).toHaveBeenCalledTimes(1);
          return OperationStatus.Success;
        });

        const result: OperationStatus = await manager.executeAsync({
          abortSignal: new AbortController().signal,
          parallelism: 1,
          terminal
        });

        expect(result).toBe(OperationStatus.Success);
        expect(terminalProvider.getOutput()).toMatchSnapshot();

        expect(runAlpha).toHaveBeenCalledTimes(1);
        expect(runBeta).toHaveBeenCalledTimes(1);

        expect(alpha.state?.status).toBe(OperationStatus.Success);
        expect(beta.state?.status).toBe(OperationStatus.Success);
      });

      it('blocks on failure', async () => {
        const runAlpha: ExecuteAsyncMock = jest.fn();
        const runBeta: ExecuteAsyncMock = jest.fn();

        const alpha: Operation = new Operation({
          name: 'alpha',
          runner: {
            name: 'alpha',
            executeAsync: runAlpha,
            silent: false
          }
        });
        const beta: Operation = new Operation({
          name: 'beta',
          runner: {
            name: 'alpha',
            executeAsync: runBeta,
            silent: false
          }
        });
        beta.addDependency(alpha);
        const manager: OperationExecutionManager = new OperationExecutionManager(new Set([alpha, beta]));

        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
        const terminal: ITerminal = new Terminal(terminalProvider);

        runAlpha.mockImplementationOnce(async () => {
          expect(runBeta).not.toHaveBeenCalled();
          return OperationStatus.Failure;
        });

        runBeta.mockImplementationOnce(async () => {
          expect(runAlpha).toHaveBeenCalledTimes(1);
          return OperationStatus.Success;
        });

        const result: OperationStatus = await manager.executeAsync({
          abortSignal: new AbortController().signal,
          parallelism: 1,
          terminal
        });

        expect(result).toBe(OperationStatus.Failure);
        expect(terminalProvider.getOutput()).toMatchSnapshot();
        expect(runAlpha).toHaveBeenCalledTimes(1);
        expect(runBeta).toHaveBeenCalledTimes(0);

        expect(alpha.state?.status).toBe(OperationStatus.Failure);
        expect(beta.state?.status).toBe(OperationStatus.Blocked);
      });

      it('does not track noops', async () => {
        const operation: Operation = new Operation({
          name: 'alpha',
          runner: {
            name: 'alpha',
            executeAsync(): Promise<OperationStatus> {
              return Promise.resolve(OperationStatus.NoOp);
            },
            silent: true
          }
        });
        const manager: OperationExecutionManager = new OperationExecutionManager(new Set([operation]));

        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
        const terminal: ITerminal = new Terminal(terminalProvider);

        const result: OperationStatus = await manager.executeAsync({
          abortSignal: new AbortController().signal,
          parallelism: 1,
          terminal
        });

        expect(result).toBe(OperationStatus.NoOp);
        expect(terminalProvider.getOutput()).toMatchSnapshot();
      });
    });

    describe('watch mode', () => {
      it('executes in order', async () => {
        const runAlpha: ExecuteAsyncMock = jest.fn();
        const runBeta: ExecuteAsyncMock = jest.fn();

        const requestRun: jest.Mock = jest.fn();

        const alpha: Operation = new Operation({
          name: 'alpha',
          runner: {
            name: 'alpha',
            executeAsync: runAlpha,
            silent: false
          }
        });
        const beta: Operation = new Operation({
          name: 'beta',
          runner: {
            name: 'alpha',
            executeAsync: runBeta,
            silent: false
          }
        });
        beta.addDependency(alpha);
        const manager: OperationExecutionManager = new OperationExecutionManager(new Set([alpha, beta]));

        const terminalProvider1: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
        const terminal1: ITerminal = new Terminal(terminalProvider1);

        let betaRequestRun: IOperationRunnerContext['requestRun'];

        runAlpha.mockImplementationOnce(async () => {
          expect(runBeta).not.toHaveBeenCalled();
          return OperationStatus.Success;
        });

        runBeta.mockImplementationOnce(async (options) => {
          betaRequestRun = options.requestRun;
          expect(runAlpha).toHaveBeenCalledTimes(1);
          return OperationStatus.Success;
        });

        const result1: OperationStatus = await manager.executeAsync({
          abortSignal: new AbortController().signal,
          parallelism: 1,
          terminal: terminal1,
          requestRun
        });

        expect(requestRun).not.toHaveBeenCalled();
        expect(betaRequestRun).toBeDefined();

        expect(result1).toBe(OperationStatus.Success);
        expect(terminalProvider1.getOutput()).toMatchSnapshot('first');

        expect(runAlpha).toHaveBeenCalledTimes(1);
        expect(runBeta).toHaveBeenCalledTimes(1);

        expect(alpha.state?.status).toBe(OperationStatus.Success);
        expect(beta.state?.status).toBe(OperationStatus.Success);

        betaRequestRun!();

        expect(requestRun).toHaveBeenCalledTimes(1);
        expect(requestRun).toHaveBeenLastCalledWith(beta.name);

        const terminalProvider2: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
        const terminal2: ITerminal = new Terminal(terminalProvider2);

        runAlpha.mockImplementationOnce(async () => {
          return OperationStatus.NoOp;
        });

        runBeta.mockImplementationOnce(async () => {
          return OperationStatus.Success;
        });

        const result2: OperationStatus = await manager.executeAsync({
          abortSignal: new AbortController().signal,
          parallelism: 1,
          terminal: terminal2,
          requestRun
        });

        expect(result2).toBe(OperationStatus.Success);
        expect(terminalProvider2.getOutput()).toMatchSnapshot('second');

        expect(runAlpha).toHaveBeenCalledTimes(2);
        expect(runBeta).toHaveBeenCalledTimes(2);

        expect(alpha.lastState?.status).toBe(OperationStatus.Success);
        expect(beta.lastState?.status).toBe(OperationStatus.Success);

        expect(alpha.state?.status).toBe(OperationStatus.NoOp);
        expect(beta.state?.status).toBe(OperationStatus.Success);
      });
    });
  });
});
