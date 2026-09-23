// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';

import { installWindowsHideDefault, withWindowsHideDefault } from '../WindowsSubprocessConsoles';

describe('Windows subprocess console defaults', () => {
  const callback = (): void => {};

  it('adds windowsHide to every child_process call shape unless the caller chose a value', () => {
    expect(withWindowsHideDefault(['git'], 1)).toEqual(['git', { windowsHide: true }]);
    expect(withWindowsHideDefault(['git', ['status']], 2)).toEqual([
      'git',
      ['status'],
      { windowsHide: true }
    ]);
    expect(withWindowsHideDefault(['git', ['status'], { cwd: '/repo' }], 2)).toEqual([
      'git',
      ['status'],
      { cwd: '/repo', windowsHide: true }
    ]);
    expect(withWindowsHideDefault(['git', { stdio: 'pipe' }], 1)).toEqual([
      'git',
      { stdio: 'pipe', windowsHide: true }
    ]);
    expect(withWindowsHideDefault(['git', callback], 1)).toEqual(['git', { windowsHide: true }, callback]);
    expect(withWindowsHideDefault(['git', ['status'], callback], 2)).toEqual([
      'git',
      ['status'],
      { windowsHide: true },
      callback
    ]);
    expect(withWindowsHideDefault(['git', ['status'], { windowsHide: false }], 2)).toEqual([
      'git',
      ['status'],
      { windowsHide: false }
    ]);
    expect(withWindowsHideDefault(['git', ['status'], { windowsHide: undefined }], 2)).toEqual([
      'git',
      ['status'],
      { windowsHide: true }
    ]);
  });

  it('does not modify the caller options object', () => {
    const options: childProcess.SpawnOptions = { cwd: '/repo' };
    withWindowsHideDefault(['git', [], options], 2);
    expect(options).toEqual({ cwd: '/repo' });
  });

  it('wraps each child_process function once, preserving results and argument positions', () => {
    const calls: Array<[string, unknown[]]> = [];
    const record =
      (name: string): ((...args: unknown[]) => string) =>
      (...args: unknown[]): string => {
        calls.push([name, args]);
        return name;
      };
    const target: Record<string, unknown> = {
      spawn: record('spawn'),
      spawnSync: record('spawnSync'),
      execFile: record('execFile'),
      execFileSync: record('execFileSync'),
      fork: record('fork'),
      exec: record('exec'),
      execSync: record('execSync'),
      unrelated: record('unrelated')
    };
    const unrelated: unknown = target.unrelated;
    installWindowsHideDefault(target);
    const spawn: unknown = target.spawn;
    installWindowsHideDefault(target);
    expect(target.spawn).toBe(spawn);
    expect(target.unrelated).toBe(unrelated);

    const call = (name: string, ...args: unknown[]): unknown =>
      (target[name] as (...callArgs: unknown[]) => unknown)(...args);
    expect(call('spawn', 'git', ['status'])).toBe('spawn');
    call('spawnSync', 'git', { encoding: 'utf8' });
    call('execFile', 'git', ['status'], callback);
    call('execFileSync', 'git', ['status'], { windowsHide: false });
    call('fork', './worker.js', ['--flag']);
    call('exec', 'git status', callback);
    call('execSync', 'git status');
    call('unrelated', 'git');
    expect(calls).toEqual([
      ['spawn', ['git', ['status'], { windowsHide: true }]],
      ['spawnSync', ['git', { encoding: 'utf8', windowsHide: true }]],
      ['execFile', ['git', ['status'], { windowsHide: true }, callback]],
      ['execFileSync', ['git', ['status'], { windowsHide: false }]],
      ['fork', ['./worker.js', ['--flag'], { windowsHide: true }]],
      ['exec', ['git status', { windowsHide: true }, callback]],
      ['execSync', ['git status', { windowsHide: true }]],
      ['unrelated', ['git']]
    ]);
  });

  it('still runs real child processes through the wrapped functions', () => {
    // A copy, so that this test does not change the child_process module shared with other tests.
    const target: Record<string, unknown> = { ...childProcess };
    installWindowsHideDefault(target);
    const spawnSync: typeof childProcess.spawnSync = target.spawnSync as typeof childProcess.spawnSync;
    const result: childProcess.SpawnSyncReturns<string> = spawnSync(
      process.execPath,
      ['-e', 'process.stdout.write("ok")'],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('ok');
  });
});
