// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  formatAdmissionFailure,
  getConfiguredAdmission,
  parseClientAdmissionControls
} from '../ClientAdmissionControls';
import { selectClientRoute } from '../routing';

describe(parseClientAdmissionControls.name, () => {
  it.each([
    { argv: ['build'], remaining: ['build'], admission: undefined },
    { argv: ['build', '--no-wait'], remaining: ['build'], admission: { noWait: true } },
    { argv: ['--wait-timeout', '1.25', 'build'], remaining: ['build'], admission: { waitTimeoutMs: 1250 } },
    { argv: ['build', '--wait-timeout=0'], remaining: ['build'], admission: { waitTimeoutMs: 0 } },
    {
      argv: ['build', '--wait-timeout=2147483.647'],
      remaining: ['build'],
      admission: { waitTimeoutMs: 2147483647 }
    },
    {
      argv: ['script', '--', '--no-wait', '--wait-timeout', '2'],
      remaining: ['script', '--', '--no-wait', '--wait-timeout', '2'],
      admission: undefined
    }
  ])('parses $argv', ({ argv, remaining, admission }) => {
    expect(parseClientAdmissionControls(argv)).toEqual({ argv: remaining, admission });
  });

  it.each([
    ['build', '--wait-timeout'],
    ['build', '--wait-timeout='],
    ['build', '--wait-timeout=-1'],
    ['build', '--wait-timeout=Infinity'],
    ['build', '--wait-timeout=1e3'],
    ['build', '--wait-timeout=2147483.648'],
    ['build', '--wait-timeout=2147483.6471'],
    ['build', '--wait-timeout=1', '--wait-timeout=2'],
    ['build', '--no-wait', '--wait-timeout=0'],
    ['build', '--no-wait=false']
  ])('rejects invalid admission arguments %j', (...argv) => {
    expect(() => parseClientAdmissionControls(argv)).toThrow();
  });

  it('removes daemon-only controls before native fallback while retaining script arguments', () => {
    expect(
      selectClientRoute({
        argv: ['build', '--no-daemon', '--no-wait', '--', '--wait-timeout=2'],
        enabled: true,
        environment: {},
        rushx: false
      })
    ).toEqual({
      argv: ['build', '--', '--wait-timeout=2'],
      nativeArgv: ['build', '--', '--wait-timeout=2'],
      commandName: 'build',
      daemon: false,
      admission: { noWait: true }
    });
  });
});

describe(getConfiguredAdmission.name, () => {
  it('marks the built-in default so it does not bound waiting behind a compatible build', () => {
    expect(getConfiguredAdmission({ queueTimeoutSeconds: 30, explicit: false })).toEqual({
      waitTimeoutMs: 30000,
      waitTimeoutIsDefault: true
    });
  });

  it('does not mark an explicitly configured timeout as the default', () => {
    expect(getConfiguredAdmission({ queueTimeoutSeconds: 1.5, explicit: true })).toEqual({ waitTimeoutMs: 1500 });
  });
});

describe(formatAdmissionFailure.name, () => {
  it('explains a wait timeout and offers only the per-invocation way to wait longer', () => {
    const message: string = formatAdmissionFailure('wait-timeout', { waitTimeoutMs: 5000 });
    expect(message).toContain(
      'daemon admission failed (wait-timeout): timed out after its 5s wait timeout waiting for'
    );
    expect(message).toContain('pass --wait-timeout <seconds>');
    // Exporting it would break later commands of Rush versions that reject unknown RUSH_ variables.
    expect(message).not.toContain('RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS');
  });

  it('explains a no-wait failure', () => {
    expect(formatAdmissionFailure('no-wait', { noWait: true })).toContain('--no-wait was specified');
  });

  it("prints the daemon's reason for a wait timeout instead of the generic explanation", () => {
    const reason: string =
      "The rushx script was not admitted before the daemon could restart for another request's environment. " +
      'Use --wait-timeout <seconds> to wait longer.';
    expect(formatAdmissionFailure('wait-timeout', { waitTimeoutMs: 5000 }, reason)).toBe(
      `rush-client: daemon admission failed (wait-timeout): ${reason}\n`
    );
  });

  it("adds the way to wait longer when the daemon's reason does not name it", () => {
    expect(
      formatAdmissionFailure(
        'wait-timeout',
        { waitTimeoutMs: 5000 },
        'The request was not admitted within 5000ms.'
      )
    ).toBe(
      'rush-client: daemon admission failed (wait-timeout): The request was not admitted within 5000ms. ' +
        'To wait longer, pass --wait-timeout <seconds>.\n'
    );
  });

  it("prints the daemon's reason for a no-wait failure", () => {
    const reason: string =
      'Another request is waiting to restart the daemon for its environment; ' +
      'the rushx script did not wait for the restart.';
    expect(formatAdmissionFailure('no-wait', { noWait: true }, reason)).toBe(
      `rush-client: daemon admission failed (no-wait): ${reason}\n`
    );
  });

  it('keeps the generic explanation when the daemon sent no reason', () => {
    expect(formatAdmissionFailure('wait-timeout', { waitTimeoutMs: 5000 }, '')).toBe(
      formatAdmissionFailure('wait-timeout', { waitTimeoutMs: 5000 })
    );
    expect(formatAdmissionFailure('no-wait', { noWait: true }, '')).toBe(
      formatAdmissionFailure('no-wait', { noWait: true })
    );
  });
});
