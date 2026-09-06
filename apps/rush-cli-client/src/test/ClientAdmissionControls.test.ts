// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseClientAdmissionControls } from '../ClientAdmissionControls';
import { selectClientRoute } from '../routing';

describe(parseClientAdmissionControls.name, () => {
  it.each([
    { argv: ['build'], remaining: ['build'], admission: undefined },
    { argv: ['build', '--no-wait'], remaining: ['build'], admission: { noWait: true } },
    { argv: ['--wait-timeout', '1.25', 'build'], remaining: ['build'], admission: { waitTimeoutMs: 1250 } },
    { argv: ['build', '--wait-timeout=0'], remaining: ['build'], admission: { waitTimeoutMs: 0 } },
    {
      argv: ['build', '--wait-timeout=2147483.647'], remaining: ['build'],
      admission: { waitTimeoutMs: 2147483647 }
    },
    {
      argv: ['script', '--', '--no-wait', '--wait-timeout', '2'],
      remaining: ['script', '--', '--no-wait', '--wait-timeout', '2'], admission: undefined
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
    expect(selectClientRoute({
      argv: ['build', '--no-daemon', '--no-wait', '--', '--wait-timeout=2'],
      enabled: true, environment: {}, rushx: false
    })).toEqual({
      argv: ['build', '--', '--wait-timeout=2'],
      commandName: 'build', daemon: false, admission: { noWait: true }
    });
  });
});
