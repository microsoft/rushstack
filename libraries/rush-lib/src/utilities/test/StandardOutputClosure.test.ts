// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EventEmitter } from 'node:events';

import {
  CLOSED_OUTPUT_EXIT_CODE,
  formatClosedOutputNotice,
  type IClosedStandardOutput,
  type IStandardOutputClosureProcess,
  StandardOutputClosure
} from '../StandardOutputClosure';

class FakeProcess extends EventEmitter implements IStandardOutputClosureProcess {
  public readonly stdout: EventEmitter = new EventEmitter();
  public readonly stderr: EventEmitter = new EventEmitter();
  public exitCode: number | string | undefined = undefined;

  /** Mirrors process.exit(): Node.js reads exitCode again after the 'exit' listeners. */
  public exit(code: number): number | string | undefined {
    this.exitCode = code;
    this.emit('exit', code);
    return this.exitCode;
  }
}

function createError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`write ${code}`);
  error.code = code;
  return error;
}

describe(StandardOutputClosure.name, () => {
  it('records the first EPIPE of each stream once and exits with 141', () => {
    const target: FakeProcess = new FakeProcess();
    const closure: StandardOutputClosure = StandardOutputClosure.install(target);
    const closures: IClosedStandardOutput[] = [];
    closure.onClosed((closed: IClosedStandardOutput) => closures.push(closed));

    expect(closure.firstClosed).toBeUndefined();
    target.stdout.emit('error', createError('EPIPE'));
    target.stdout.emit('error', createError('EPIPE'));
    target.stderr.emit('error', createError('ECONNRESET'));

    expect(closures).toEqual([
      { streamName: 'stdout', code: 'EPIPE' },
      { streamName: 'stderr', code: 'ECONNRESET' }
    ]);
    expect(closure.firstClosed).toEqual({ streamName: 'stdout', code: 'EPIPE' });
    expect(target.exitCode).toBe(CLOSED_OUTPUT_EXIT_CODE);
    expect(CLOSED_OUTPUT_EXIT_CODE).toBe(141);
  });

  it('keeps exit code 141 when the process later exits with another code', () => {
    const target: FakeProcess = new FakeProcess();
    StandardOutputClosure.install(target);
    target.stdout.emit('error', createError('EPIPE'));
    target.exitCode = 0;

    expect(target.exit(1)).toBe(141);
  });

  it('keeps the exit code of a crash after a reader exited', () => {
    const target: FakeProcess = new FakeProcess();
    StandardOutputClosure.install(target);
    target.stdout.emit('error', createError('EPIPE'));
    // Node.js emits this for an uncaught exception or an unhandled rejection, then exits with code 1.
    target.emit('uncaughtExceptionMonitor', new Error('crash'), 'uncaughtException');

    expect(target.exit(1)).toBe(1);
  });

  it('leaves the exit code alone when no reader exited', () => {
    const target: FakeProcess = new FakeProcess();
    StandardOutputClosure.install(target);

    expect(target.exit(1)).toBe(1);
    expect(target.exit(0)).toBe(0);
  });

  it('tells a listener at once about a stream that closed before it subscribed, until it unsubscribes', () => {
    const target: FakeProcess = new FakeProcess();
    const closure: StandardOutputClosure = StandardOutputClosure.install(target);
    target.stderr.emit('error', createError('EPIPE'));

    const closures: IClosedStandardOutput[] = [];
    const stop: () => void = closure.onClosed((closed: IClosedStandardOutput) => closures.push(closed));
    expect(closures).toEqual([{ streamName: 'stderr', code: 'EPIPE' }]);

    stop();
    target.stdout.emit('error', createError('EPIPE'));
    expect(closures).toHaveLength(1);
  });

  it('still fails the process for another stream error that nothing else handles', () => {
    const target: FakeProcess = new FakeProcess();
    StandardOutputClosure.install(target);
    const error: NodeJS.ErrnoException = createError('EBADF');

    expect(() => target.stdout.emit('error', error)).toThrow(error);
    expect(target.exitCode).toBeUndefined();

    const handled: Error[] = [];
    target.stderr.on('error', (otherError: Error) => handled.push(otherError));
    expect(() => target.stderr.emit('error', error)).not.toThrow();
    expect(handled).toEqual([error]);
  });

  it('installs its listeners once for each process', () => {
    const target: FakeProcess = new FakeProcess();
    const closure: StandardOutputClosure = StandardOutputClosure.install(target);

    expect(StandardOutputClosure.install(target)).toBe(closure);
    expect(target.stdout.listenerCount('error')).toBe(1);
    expect(target.stderr.listenerCount('error')).toBe(1);
    expect(target.listenerCount('exit')).toBe(1);
    expect(target.listenerCount('uncaughtExceptionMonitor')).toBe(1);
  });
});

describe(formatClosedOutputNotice.name, () => {
  it('names the command, the stream and the error code', () => {
    expect(formatClosedOutputNotice('build', { streamName: 'stdout', code: 'EPIPE' }, false)).toBe(
      'rush: build cancelled, because the process reading its stdout exited (EPIPE).\n'
    );
    expect(formatClosedOutputNotice('test', { streamName: 'stderr', code: 'ECONNRESET' }, true)).toBe(
      'rush: test cancelled, because the process reading its stderr exited (ECONNRESET).' +
        ' Operations that already started will finish first.\n'
    );
  });
});
