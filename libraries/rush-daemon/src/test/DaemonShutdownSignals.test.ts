// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EventEmitter } from 'node:events';

import { DaemonShutdownError } from '../DaemonShutdownError';
import { listenForShutdownSignals, type IShutdownSignals } from '../DaemonShutdownSignals';

describe(listenForShutdownSignals.name, () => {
  let emitter: EventEmitter;
  let nowMs: number;
  let onForce: jest.Mock;
  let signals: IShutdownSignals;

  beforeEach(() => {
    emitter = new EventEmitter();
    nowMs = 1000;
    onForce = jest.fn();
    signals = listenForShutdownSignals({ emitter, onForce, getNowMs: () => nowMs });
  });
  afterEach(() => signals.dispose());

  function send(signal: NodeJS.Signals, afterMs: number = 0): void {
    nowMs += afterMs;
    emitter.emit(signal, signal);
  }

  it('requests a clean shutdown on the first signal', () => {
    expect(signals.signal.aborted).toBe(false);
    send('SIGTERM');
    expect(signals.signal.reason).toBeInstanceOf(DaemonShutdownError);
    expect(signals.signal.reason).toMatchObject({ initiator: 'signal', signal: 'SIGTERM' });
    expect(onForce).not.toHaveBeenCalled();
  });

  it("ignores SubprocessTerminator's relay of the first signal, and forces on the next one", () => {
    send('SIGTERM');
    send('SIGTERM', 5);
    expect(onForce).not.toHaveBeenCalled();
    send('SIGTERM', 5);
    expect(onForce).toHaveBeenCalledWith('SIGTERM');
  });

  it('forces on a different signal, or on the same one after a moment', () => {
    send('SIGTERM');
    send('SIGINT', 5);
    expect(onForce).toHaveBeenLastCalledWith('SIGINT');

    signals.dispose();
    onForce = jest.fn();
    signals = listenForShutdownSignals({ emitter, onForce, getNowMs: () => nowMs });
    send('SIGINT');
    send('SIGINT', 1500);
    expect(onForce).toHaveBeenCalledWith('SIGINT');
  });

  it('stops listening when disposed', () => {
    expect(emitter.listenerCount('SIGINT')).toBe(1);
    expect(emitter.listenerCount('SIGTERM')).toBe(1);
    signals.dispose();
    expect(emitter.listenerCount('SIGINT')).toBe(0);
    expect(emitter.listenerCount('SIGTERM')).toBe(0);
  });
});
