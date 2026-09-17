// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import {
  captureTestProcessIdentity,
  isTestProcessRunning,
  waitForTestProcessExitAsync
} from './TestProcessExit';

describe('owned fixture process exit inspection', () => {
  const pid: number = process.pid + 1;
  const platformDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  let state: string;
  let startTime: string;
  let fdSize: string;

  beforeEach(() => {
    state = 'S';
    startTime = '100';
    fdSize = '64';
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    jest.spyOn(process, 'kill').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockImplementation((filename) => {
      if (String(filename) === `/proc/${pid}/status`) return `State:\t${state}\nFDSize:\t${fdSize}\n`;
      const fields: string[] = Array.from({ length: 20 }, () => '0');
      fields[0] = state;
      fields[19] = startTime;
      return `${pid} (owned writer) ${fields.join(' ')}\n`;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'platform', platformDescriptor);
  });

  it('captures start time and rejects a still-executable writer even when output has closed', async () => {
    const identity = captureTestProcessIdentity(pid);
    expect(identity).toEqual({ pid, linuxStartTime: '100' });
    expect(isTestProcessRunning(identity)).toBe(true);
    await expect(waitForTestProcessExitAsync(identity, 0)).rejects.toThrow('did not exit');
  });

  it('accepts the same unreaped zombie only after its descriptor table is gone', async () => {
    const identity = captureTestProcessIdentity(pid);
    state = 'Z';
    expect(isTestProcessRunning(identity)).toBe(true);
    fdSize = '0';
    expect(process.kill(pid, 0)).toBe(true);
    await waitForTestProcessExitAsync(identity, 0);
  });

  it('does not wait for or signal a new process that reused the captured PID', async () => {
    const identity = captureTestProcessIdentity(pid);
    startTime = '200';
    expect(isTestProcessRunning(identity)).toBe(false);
    await waitForTestProcessExitAsync(identity, 0);
    expect(jest.mocked(process.kill).mock.calls.every(([, signal]) => signal === 0)).toBe(true);
  });

  it('fails closed on malformed process or descriptor information', () => {
    const identity = captureTestProcessIdentity(pid);
    startTime = 'invalid';
    expect(() => isTestProcessRunning(identity)).toThrow('Cannot inspect');
    startTime = '100';
    state = 'Z';
    fdSize = 'invalid';
    expect(() => isTestProcessRunning(identity)).toThrow('descriptors');
  });

  it('rejects an invalid caller budget without extending the default', async () => {
    await expect(waitForTestProcessExitAsync(pid, -1)).rejects.toThrow('nonnegative');
    await expect(waitForTestProcessExitAsync(pid, Infinity)).rejects.toThrow('nonnegative');
  });
});
