// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import { readUptimeTicks } from '../DaemonOperationGroupSpawnMark';
import { ownGroupId } from '../DaemonOwnGroup';

// The clock and own-group reads against fixed /proc text, so no test here depends on the host or its processes.
const PROC_UPTIME: string = '/proc/uptime';
const UPTIME: string = '12345.67 98765.43\n';
const UPTIME_TICKS: number = 1234567;
const PROC_SELF_STAT: string = '/proc/self/stat';
// "<pid> (<name>) <state> <ppid> <pgrp> <session> ...", where the name may hold any text, ") " included.
const SELF_STAT: string = '4242 (a) b (c) S 101 202 303 0 -1 4194304\n';
const OWN_GROUP: number = 202;
const NO_STAT: Error = Object.assign(new Error(`ENOENT: ${PROC_SELF_STAT}`), { code: 'ENOENT' });

afterEach(() => {
  jest.restoreAllMocks();
});

// Answers reads of `file` with `content`, or throws it when it is an error, and passes every other read through.
function fakeRead(file: string, content: string | Error): void {
  const { readFileSync } = fs;
  jest.spyOn(fs, 'readFileSync').mockImplementation(((
    ...args: Parameters<typeof readFileSync>
  ): string | Buffer => {
    const [readPath] = args;
    if (readPath !== file) return readFileSync(...args);
    if (content instanceof Error) throw content;
    return content;
  }) as typeof readFileSync);
}

it('counts the clock in hundredths of a second', () => {
  fakeRead(PROC_UPTIME, UPTIME);
  expect(readUptimeTicks()).toBe(UPTIME_TICKS);
});

it('reads its own process group, not its parent, from after the last ")" of its name', () => {
  fakeRead(PROC_SELF_STAT, SELF_STAT);
  expect(ownGroupId()).toBe(OWN_GROUP);
});

it('reports no own process group when /proc/self/stat cannot be read', () => {
  fakeRead(PROC_SELF_STAT, NO_STAT);
  expect(ownGroupId()).toBeUndefined();
});
