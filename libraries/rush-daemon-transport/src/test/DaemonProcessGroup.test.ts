// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';

const GROUP_ID: number = 4242;

function throwErrno(code: string): never {
  throw Object.assign(new Error(code), { code });
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('treats only ESRCH as proof that a process group is gone', () => {
  jest.spyOn(process, 'kill').mockImplementation(() => throwErrno('ESRCH'));
  expect(POSIX_PROCESS_GROUP_OPS.groupExists(GROUP_ID)).toBe(false);
  expect(() => POSIX_PROCESS_GROUP_OPS.signalGroup(GROUP_ID, 'SIGTERM')).not.toThrow();
});

it('propagates EPERM instead of assuming the group is gone', () => {
  jest.spyOn(process, 'kill').mockImplementation(() => throwErrno('EPERM'));
  expect(() => POSIX_PROCESS_GROUP_OPS.groupExists(GROUP_ID)).toThrow('EPERM');
  expect(() => POSIX_PROCESS_GROUP_OPS.signalGroup(GROUP_ID, 'SIGKILL')).toThrow('EPERM');
});

it('signals the negated group id', () => {
  const kill: jest.SpyInstance = jest.spyOn(process, 'kill').mockImplementation(() => true);
  POSIX_PROCESS_GROUP_OPS.signalGroup(GROUP_ID, 'SIGTERM');
  expect(kill).toHaveBeenCalledWith(-GROUP_ID, 'SIGTERM');
});
