// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DaemonShutdownError,
  getDaemonShutdownReason,
  getRequestShutdownReason,
  type IDaemonShutdownErrorOptions
} from '../DaemonShutdownError';

const INITIATORS: ReadonlyArray<[IDaemonShutdownErrorOptions, string]> = [
  [{ initiator: 'controlClient' }, 'requested by "rush-client daemon stop" or "daemon restart"'],
  [{ initiator: 'signal', signal: 'SIGTERM' }, 'the daemon process received SIGTERM'],
  [{ initiator: 'signal' }, 'the daemon process received a termination signal'],
  [{ initiator: 'idleTimeout' }, 'idle timeout'],
  [{ initiator: 'restart' }, 'the daemon restarted to apply workspace changes'],
  [{ initiator: 'host' }, 'the daemon host was closed'],
  [
    { initiator: 'socketLost' },
    'its socket file was deleted or replaced, so no new client could connect to it'
  ]
];

describe(DaemonShutdownError.name, () => {
  it.each(INITIATORS)(
    'says that a request that started was running (%j)',
    (options: IDaemonShutdownErrorOptions, initiator: string) => {
      const expected: string =
        `The Rush daemon was shut down (${initiator}) while this request was running; ` +
        're-run the command.';
      expect(new DaemonShutdownError(options).message).toBe(expected);
      expect(new DaemonShutdownError({ ...options, requestStarted: true }).message).toBe(expected);
      expect(new DaemonShutdownError(options).requestStarted).toBe(true);
    }
  );

  it.each(INITIATORS)(
    'says that a request that did not start was queued (%j)',
    (options: IDaemonShutdownErrorOptions, initiator: string) => {
      const error: DaemonShutdownError = new DaemonShutdownError({ ...options, requestStarted: false });
      expect(error.message).toBe(
        `The Rush daemon was shut down (${initiator}) while this request was queued; it did not start. ` +
          'Re-run the command.'
      );
      expect(error).toMatchObject({
        initiator: options.initiator,
        name: 'DaemonShutdownError',
        requestStarted: false,
        signal: options.signal
      });
    }
  );
});

describe(getRequestShutdownReason.name, () => {
  it('gives a request that did not start a queued copy of the shutdown reason', () => {
    const shutdown: DaemonShutdownError = new DaemonShutdownError({ initiator: 'signal', signal: 'SIGINT' });
    const reason: Error = getRequestShutdownReason(shutdown, false);
    expect(reason).toBeInstanceOf(DaemonShutdownError);
    expect(reason).not.toBe(shutdown);
    expect(reason).toMatchObject({ initiator: 'signal', requestStarted: false, signal: 'SIGINT' });
    expect(reason.message).toBe(
      'The Rush daemon was shut down (the daemon process received SIGINT) while this request was queued; ' +
        'it did not start. Re-run the command.'
    );
    expect(shutdown.requestStarted).toBe(true);

    // The routers read the reason from the request's abort signal.
    const controller: AbortController = new AbortController();
    controller.abort(reason);
    expect(getDaemonShutdownReason(controller.signal)).toBe(reason);
  });

  it('gives a request that started the shutdown reason itself', () => {
    const shutdown: DaemonShutdownError = new DaemonShutdownError({ initiator: 'controlClient' });
    expect(getRequestShutdownReason(shutdown, true)).toBe(shutdown);
  });

  it('keeps a queued reason and any other error as they are', () => {
    const queued: DaemonShutdownError = new DaemonShutdownError({ initiator: 'host', requestStarted: false });
    expect(getRequestShutdownReason(queued, false)).toBe(queued);
    expect(getRequestShutdownReason(queued, true)).toBe(queued);
    const closed: Error = new Error('The daemon client connection closed.');
    expect(getRequestShutdownReason(closed, false)).toBe(closed);
    expect(getRequestShutdownReason(closed, true)).toBe(closed);
  });
});
