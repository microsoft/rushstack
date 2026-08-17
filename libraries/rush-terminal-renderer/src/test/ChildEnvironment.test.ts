// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonClientCaps } from '@rushstack/rush-daemon-protocol';

import {
  applyDaemonChildEnvironment,
  getDaemonChildEnvironmentOverrides
} from '../ChildEnvironment';

const COLUMNS: number = 132;
const COLOR_LEVEL: number = 3;
const EMPTY_COUNT: number = 0;

const TTY_CAPS: IDaemonClientCaps = { isTTY: true, columns: COLUMNS, colorLevel: COLOR_LEVEL };
const NON_TTY_CAPS: IDaemonClientCaps = { isTTY: false };

it('gives a TTY client FORCE_COLOR and COLUMNS', () => {
  expect(getDaemonChildEnvironmentOverrides(TTY_CAPS)).toEqual({
    FORCE_COLOR: String(COLOR_LEVEL),
    COLUMNS: String(COLUMNS)
  });
});

it('defaults FORCE_COLOR to 1 for a TTY client without a color level', () => {
  expect(getDaemonChildEnvironmentOverrides({ isTTY: true })).toEqual({ FORCE_COLOR: '1' });
});

it('gives a non-TTY client neither variable', () => {
  expect(getDaemonChildEnvironmentOverrides(NON_TTY_CAPS)).toEqual({});
});

it('strips ambient FORCE_COLOR/COLUMNS for a non-TTY client', () => {
  const base: Record<string, string> = { FORCE_COLOR: '1', COLUMNS: '200', PATH: '/bin' };
  const result: Record<string, string | undefined> = applyDaemonChildEnvironment(base, NON_TTY_CAPS);
  expect(result).toEqual({ PATH: '/bin' });
});

it('overrides ambient values for a TTY client', () => {
  const base: Record<string, string> = { FORCE_COLOR: '0', PATH: '/bin' };
  const result: Record<string, string | undefined> = applyDaemonChildEnvironment(base, TTY_CAPS);
  expect(result).toEqual({ PATH: '/bin', FORCE_COLOR: String(COLOR_LEVEL), COLUMNS: String(COLUMNS) });
});

it('computes independent results for concurrent clients', () => {
  const ttyResult: Record<string, string> = getDaemonChildEnvironmentOverrides(TTY_CAPS);
  const nonTtyResult: Record<string, string> = getDaemonChildEnvironmentOverrides(NON_TTY_CAPS);
  expect(Object.keys(ttyResult)).not.toHaveLength(EMPTY_COUNT);
  expect(Object.keys(nonTtyResult)).toHaveLength(EMPTY_COUNT);
  expect(getDaemonChildEnvironmentOverrides(TTY_CAPS)).toEqual(ttyResult);
});
