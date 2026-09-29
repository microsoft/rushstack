// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { getEnvironmentIdentityEntries, getEnvironmentRestartReason } from '../EnvironmentRestartReason';

const STARTUP: Record<string, string> = {
  HOME: '/home/agent',
  NODE_OPTIONS: '--max-old-space-size=8192',
  PATH: ['/usr/local/bin', '/usr/bin'].join(path.delimiter),
  TERM: 'xterm-256color'
};

describe(getEnvironmentRestartReason.name, () => {
  const startupEntries = getEnvironmentIdentityEntries(STARTUP);

  it('returns undefined when only variables that the fingerprint ignores or normalizes differ', () => {
    expect(getEnvironmentRestartReason(startupEntries, { ...STARTUP })).toBeUndefined();
    expect(
      getEnvironmentRestartReason(startupEntries, {
        TERM: 'dumb',
        PWD: '/elsewhere',
        PATH: [STARTUP.PATH, '/usr/bin'].join(path.delimiter),
        NODE_OPTIONS: STARTUP.NODE_OPTIONS,
        HOME: STARTUP.HOME,
        UNSET: undefined
      })
    ).toBeUndefined();
  });

  it('names each variable that is changed, added or removed, sorted, and never a value', () => {
    const requested: Record<string, string | undefined> = {
      ...STARTUP,
      NODE_OPTIONS: '--inspect',
      FOO: 'bar'
    };
    delete requested.HOME;
    const reason = getEnvironmentRestartReason(startupEntries, requested);
    expect(reason).toEqual({ kind: 'environmentChanged', variableNames: ['FOO', 'HOME', 'NODE_OPTIONS'] });
    expect(JSON.stringify(reason)).not.toMatch(/bar|inspect|agent/);
  });

  it('names PATH when its entries differ, not only their repetition', () => {
    expect(
      getEnvironmentRestartReason(startupEntries, {
        ...STARTUP,
        PATH: ['/usr/bin', '/usr/local/bin'].join(path.delimiter)
      })
    ).toEqual({ kind: 'environmentChanged', variableNames: ['PATH'] });
  });

  it('treats a variable that is set to an empty string as set', () => {
    expect(getEnvironmentRestartReason(startupEntries, { ...STARTUP, NODE_OPTIONS: '' })).toEqual({
      kind: 'environmentChanged',
      variableNames: ['NODE_OPTIONS']
    });
    expect(
      getEnvironmentRestartReason(getEnvironmentIdentityEntries({ ...STARTUP, EMPTY: '' }), STARTUP)
    ).toEqual({ kind: 'environmentChanged', variableNames: ['EMPTY'] });
  });
});
