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

  it('writes each control character of a name as an escape, so that the names print on one line', () => {
    const reason = getEnvironmentRestartReason(startupEntries, {
      ...STARTUP,
      'NAME_NL\nSECOND_LINE': 'a',
      'NAME_ESC\u001b[31mRED\u001b[0m': 'b',
      'NAME_C1\u009b2J\u007f': 'c',
      'NAME_PRINTABLE_\u00e9': 'd'
    });
    expect(reason).toEqual({
      kind: 'environmentChanged',
      variableNames: [
        'NAME_C1\\x9b2J\\x7f',
        'NAME_ESC\\x1b[31mRED\\x1b[0m',
        'NAME_NL\\x0aSECOND_LINE',
        'NAME_PRINTABLE_\u00e9'
      ]
    });
  });

  it('escapes line and paragraph separators and format characters, such as a bidirectional override', () => {
    const reason = getEnvironmentRestartReason(startupEntries, {
      ...STARTUP,
      'NAME_LS\u2028PS\u2029': 'a',
      'NAME_BIDI\u202eRLO\u2066LRI\u200bZWSP': 'b',
      'NAME_SHY\u00adTAG\u{e0001}': 'c',
      'NAME_PRINTABLE_\u{1f600}': 'd'
    });
    expect(reason).toEqual({
      kind: 'environmentChanged',
      variableNames: [
        'NAME_BIDI\\u{202e}RLO\\u{2066}LRI\\u{200b}ZWSP',
        'NAME_LS\\u{2028}PS\\u{2029}',
        'NAME_PRINTABLE_\u{1f600}',
        'NAME_SHY\\xadTAG\\u{e0001}'
      ]
    });
  });

  it('escapes a backslash, so that ESC and the text "\\x1b" in a name print differently', () => {
    const reason = getEnvironmentRestartReason(startupEntries, {
      ...STARTUP,
      'NAME_Q\u001b': 'a',
      'NAME_Q\\x1b': 'b'
    });
    expect(reason).toEqual({
      kind: 'environmentChanged',
      variableNames: ['NAME_Q\\x1b', 'NAME_Q\\x5cx1b']
    });
  });
});
