// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { connectOrStartDaemonAsync } from '@rushstack/rush-client-core';
import { readDaemonLockfile, type DaemonFrameListener } from '@rushstack/rush-daemon-transport';

import * as linuxProcessGroupExit from '../LinuxProcessGroupExit';
import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { WorkspaceRequestResourceCleanupError } from '../WorkspaceRequestResources';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { captureTestDaemonListenerAsync } from './TestDaemonListener';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

jest.setTimeout(30_000);

(process.platform === 'linux' ? describe : describe.skip)('native mutation cleanup ownership', () => {
  let fixture: DaemonGraphTestFixture;
  let listener: DaemonFrameListener;
  let workerPid: number | undefined;

  beforeEach(async () => {
    workerPid = undefined;
    const captured = await captureTestDaemonListenerAsync(() =>
      DaemonGraphTestFixture.createAsync((created) => {
        created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
      })
    );
    fixture = captured.value;
    listener = captured.listener;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (workerPid !== undefined) await waitForTestProcessExitAsync(workerPid);
    try {
      await fixture.host.closeAsync();
    } catch (error) {
      if (!(error instanceof WorkspaceRequestResourceCleanupError)) throw error;
    }
    // Only inspection is injected; the real worker is joined before this explicit test-only release.
    await listener.closeAsync();
    await removeTestFolderAsync(fixture.folder, true);
  });

  it.each([
    ['install', 'inspection'],
    ['install', 'timeout'],
    ['update', 'inspection'],
    ['update', 'timeout']
  ])('retains ownership after %s worker join %s failure, even after the result drains', async (command, kind) => {
    const nativeChildProcess: typeof childProcess = jest.requireActual('node:child_process');
    const originalOwner = readDaemonLockfile(fixture.host.paths.lockfilePath);
    const originalWait = linuxProcessGroupExit.waitForLinuxProcessGroupExitAsync;
    const originalKill = process.kill.bind(process);
    const originalExecFile = nativeChildProcess.execFile;
    const diagnostics: unknown[] = [];
    jest.spyOn(process, 'emitWarning').mockImplementation((error) => {
      diagnostics.push(error);
    });
    const spawn = jest.spyOn(nativeChildProcess, 'spawn');
    jest.spyOn(linuxProcessGroupExit, 'waitForLinuxProcessGroupExitAsync')
      .mockImplementation(async (pid) => {
        workerPid = pid;
        await originalWait(pid, 25);
      });
    jest.spyOn(process, 'kill').mockImplementation((pid, signal) =>
      workerPid !== undefined && pid === -workerPid && signal === 0
        ? true
        : originalKill(pid, signal)
    );
    let inspections: number = 0;
    jest.spyOn(nativeChildProcess, 'execFile').mockImplementation((...args) => {
      if (args[0] !== 'ps' || args[1]?.[0] !== '--sid' || args[1]?.[1] !== String(workerPid)) {
        return originalExecFile(...args);
      }
      inspections++;
      const callback = args.at(-1);
      if (typeof callback !== 'function') throw new Error('Expected a process inspection callback.');
      callback(
        kind === 'inspection' ? Object.assign(new Error('Cannot inspect owned worker'), { code: 'ENOENT' }) : null,
        kind === 'inspection' ? '' : 'S\n',
        ''
      );
      return new childProcess.ChildProcess();
    });
    // --help uses the real native worker/parser without installing dependencies in this failure fixture.
    const result = await fixture.runAsync([command, '--help']);
    const detail: string = kind === 'inspection' ? 'Cannot inspect owned worker' : 'did not exit within 25ms';
    expect(result.terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 1, outcome: 'failure', aborted: false, errorMessage: expect.stringContaining(detail) }
    });
    expect(result.terminal).not.toHaveProperty('payload.retryAfterRestart');
    expect(inspections).toBeGreaterThan(0);
    expect(workerPid).toBeDefined();
    expect(spawn.mock.calls.filter(([, args]) =>
      Array.isArray(args) && args.some((arg) => typeof arg === 'string' && arg.endsWith('/NativeMutationWorker.js'))
    )).toHaveLength(1);
    await expect(fixture.host.restartCompleted).rejects.toBeInstanceOf(WorkspaceRequestResourceCleanupError);
    await expect(fixture.host.closeAsync()).rejects.toThrow(detail);
    expect(diagnostics.some((error) => error instanceof WorkspaceRequestResourceCleanupError)).toBe(true);
    expect(readDaemonLockfile(fixture.host.paths.lockfilePath)).toEqual(originalOwner);
    expect(fs.existsSync(fixture.host.paths.socketPath)).toBe(true);
    expect(() => fixture.session.assertActive()).toThrow(WorkspaceRequestResourceCleanupError);
    expect(fixture.host.workspaceGeneration).toBe(1);
    expect(fixture.runs()).toEqual([]);

    const marker: string = path.join(fixture.folder, 'unexpected-starter');
    await expect(connectOrStartDaemonAsync({
      paths: fixture.host.paths,
      startupTimeoutMs: 100,
      timeoutMs: 25,
      startCommand: {
        command: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`],
        cwd: fixture.folder,
        environment: fixture.environment
      }
    })).rejects.toThrow(/still exists|deadline/);
    expect(fs.existsSync(marker)).toBe(false);
    expect(readDaemonLockfile(fixture.host.paths.lockfilePath)).toEqual(originalOwner);
    expect(spawn.mock.calls.some(([, args]) =>
      Array.isArray(args) && args.some((arg) => typeof arg === 'string' && arg.endsWith('/runDaemonStartup.js'))
    )).toBe(false);
  });
});
