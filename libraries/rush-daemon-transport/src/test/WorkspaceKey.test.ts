// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WORKSPACE_KEY_LENGTH, computeDaemonWorkspaceKey } from '../WorkspaceKey';

const KEY_PREFIX_LENGTH: number = 'rushd-'.length;
const FULL_KEY_LENGTH: number = KEY_PREFIX_LENGTH + WORKSPACE_KEY_LENGTH;

const BASE_INPUT = {
  canonicalRepoRoot: '/repos/example',
  rushVersion: '5.178.0',
  startupOptions: { watch: true, parallelism: 4 }
} as const;

it('is stable across runs for the same workspace', () => {
  expect(computeDaemonWorkspaceKey(BASE_INPUT)).toBe(computeDaemonWorkspaceKey(BASE_INPUT));
});

it('differs for a different repository root', () => {
  const other: string = computeDaemonWorkspaceKey({ ...BASE_INPUT, canonicalRepoRoot: '/repos/other' });
  expect(other).not.toBe(computeDaemonWorkspaceKey(BASE_INPUT));
});

it('differs for a different Rush version', () => {
  const other: string = computeDaemonWorkspaceKey({ ...BASE_INPUT, rushVersion: '6.0.0' });
  expect(other).not.toBe(computeDaemonWorkspaceKey(BASE_INPUT));
});

it('differs for different startup options', () => {
  const other: string = computeDaemonWorkspaceKey({ ...BASE_INPUT, startupOptions: { watch: false } });
  expect(other).not.toBe(computeDaemonWorkspaceKey(BASE_INPUT));
});

it('is insensitive to startup option key order', () => {
  const reordered: string = computeDaemonWorkspaceKey({
    ...BASE_INPUT,
    startupOptions: { parallelism: 4, watch: true }
  });
  expect(reordered).toBe(computeDaemonWorkspaceKey(BASE_INPUT));
});

it('produces a rushd-prefixed truncated hex key', () => {
  const key: string = computeDaemonWorkspaceKey(BASE_INPUT);
  expect(key).toHaveLength(FULL_KEY_LENGTH);
  expect(key.startsWith('rushd-')).toBe(true);
  expect(/^rushd-[0-9a-f]+$/.test(key)).toBe(true);
});
