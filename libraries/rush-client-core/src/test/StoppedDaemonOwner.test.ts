// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import type { IOwnerProcessReaders, IStoppedProcess } from '../DaemonOwnerDiagnosis';
import type { IProcessState } from '../ProcessStartTime';
import {
  findStoppedDaemonOwnerAsync,
  isDaemonOwnerStillStopped,
  STOPPED_OWNER_WINDOW_MS
} from '../StoppedDaemonOwner';
import { recordDaemonOwner } from './OrphanedOperation';

const START_TICKS: number = 4242;
const STOPPED: IProcessState = { code: 'T', parentPid: 1, startTicks: START_TICKS };
const TRACED: IProcessState = { code: 't', parentPid: 1, startTicks: START_TICKS };
const WAITING: IProcessState = { code: 'S', parentPid: 1, startTicks: START_TICKS };

describe('StoppedDaemonOwner', () => {
  let folder: string;
  let paths: IDaemonPaths;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-stopped-owner-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    // The record names this live process; the readers say what it is doing.
    recordDaemonOwner(paths, process.pid);
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  /** A `readState` that returns `states` in turn, and then the last one. */
  function statesReader(
    states: ReadonlyArray<IProcessState | undefined>
  ): jest.Mock<IProcessState | undefined, [number]> {
    let next: number = 0;
    return jest.fn((pid: number) => states[Math.min(next++, states.length - 1)]);
  }

  function readers(overrides: Partial<IOwnerProcessReaders> = {}): IOwnerProcessReaders {
    return {
      platform: 'linux',
      now: Date.now,
      readState: () => STOPPED,
      readStartTimeMs: () => undefined,
      readCommandLine: () => undefined,
      isPresent: () => true,
      hasFileOpen: (pid: number, filePath: string) => pid === process.pid && filePath === paths.lockfilePath,
      ...overrides
    };
  }

  async function findAsync(
    overrides: Partial<IOwnerProcessReaders>,
    deadline: number = Date.now() + 15000,
    signal?: AbortSignal
  ): Promise<{ stopped: IStoppedProcess | undefined; elapsedMs: number }> {
    const start: number = Date.now();
    const stopped: IStoppedProcess | undefined = await findStoppedDaemonOwnerAsync(
      paths,
      deadline,
      signal,
      readers(overrides)
    );
    return { stopped, elapsedMs: Date.now() - start };
  }

  describe('findStoppedDaemonOwnerAsync', () => {
    it('finds an owner that has the record open and stays stopped for the whole window', async () => {
      const readState: jest.Mock = statesReader([STOPPED]);

      const { stopped, elapsedMs } = await findAsync({ readState });

      expect(stopped).toEqual({ pid: process.pid, startTicks: START_TICKS });
      expect(elapsedMs).toBeGreaterThanOrEqual(STOPPED_OWNER_WINDOW_MS);
      expect(readState.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(readState.mock.calls.every(([pid]) => pid === process.pid)).toBe(true);
    });

    it('finds an owner that a tracer keeps stopped (state t)', async () => {
      expect((await findAsync({ readState: () => TRACED })).stopped).toEqual({
        pid: process.pid,
        startTicks: START_TICKS
      });
    });

    it('ends at the first sample that shows the owner resumed', async () => {
      const readState: jest.Mock = statesReader([STOPPED, STOPPED, STOPPED, WAITING, STOPPED]);

      const { stopped, elapsedMs } = await findAsync({ readState });

      expect(stopped).toBeUndefined();
      expect(readState).toHaveBeenCalledTimes(4);
      expect(elapsedMs).toBeLessThan(STOPPED_OWNER_WINDOW_MS);
    });

    it('ends when the PID names a process with another start time', async () => {
      const readState: jest.Mock = statesReader([
        STOPPED,
        STOPPED,
        { ...STOPPED, startTicks: START_TICKS + 1 }
      ]);

      expect((await findAsync({ readState })).stopped).toBeUndefined();
      expect(readState).toHaveBeenCalledTimes(3);
    });

    it('ends when a sample cannot be read', async () => {
      const readState: jest.Mock = statesReader([STOPPED, undefined, STOPPED]);

      expect((await findAsync({ readState })).stopped).toBeUndefined();
      expect(readState).toHaveBeenCalledTimes(2);
    });

    it('does not sample an owner that is not stopped or whose start time is unknown', async () => {
      for (const state of [WAITING, { code: 'T', parentPid: 1 }, undefined]) {
        const readState: jest.Mock = statesReader([state, STOPPED]);
        const hasFileOpen: jest.Mock = jest.fn(() => true);

        const { stopped, elapsedMs } = await findAsync({ readState, hasFileOpen });

        expect(stopped).toBeUndefined();
        expect(readState).toHaveBeenCalledTimes(1);
        expect(hasFileOpen).not.toHaveBeenCalled();
        expect(elapsedMs).toBeLessThan(STOPPED_OWNER_WINDOW_MS);
      }
    });

    it('does not sample an owner that does not provably have the record open', async () => {
      // For example the daemon of another workspace, whose PID an old record names, or no /proc/<pid>/fd.
      for (const isOpen of [false, undefined]) {
        const readState: jest.Mock = statesReader([STOPPED]);
        const hasFileOpen: jest.Mock = jest.fn(() => isOpen);

        const { stopped, elapsedMs } = await findAsync({ readState, hasFileOpen });

        expect(stopped).toBeUndefined();
        expect(hasFileOpen.mock.calls).toEqual([[process.pid, paths.lockfilePath]]);
        expect(readState).toHaveBeenCalledTimes(1);
        expect(elapsedMs).toBeLessThan(STOPPED_OWNER_WINDOW_MS);
      }
    });

    it('needs a readable record that names a live process', async () => {
      const readState: jest.Mock = statesReader([STOPPED]);

      fs.unlinkSync(paths.lockfilePath);
      expect((await findAsync({ readState })).stopped).toBeUndefined();
      fs.writeFileSync(paths.lockfilePath, 'not json');
      expect((await findAsync({ readState })).stopped).toBeUndefined();
      const exitedPid: number = spawnSync(process.execPath, ['-e', '']).pid;
      recordDaemonOwner(paths, exitedPid);
      expect((await findAsync({ readState })).stopped).toBeUndefined();

      expect(readState).not.toHaveBeenCalled();
    });

    it('does not sample when less than the window remains before the deadline', async () => {
      const readState: jest.Mock = statesReader([STOPPED]);

      const { stopped } = await findAsync({ readState }, Date.now() + STOPPED_OWNER_WINDOW_MS - 100);

      expect(stopped).toBeUndefined();
      expect(readState).not.toHaveBeenCalled();
    });

    it('stops sampling once the signal aborts', async () => {
      const aborted: AbortController = new AbortController();
      aborted.abort();
      expect((await findAsync({}, undefined, aborted.signal)).stopped).toBeUndefined();

      const later: AbortController = new AbortController();
      setTimeout(() => later.abort(), 200);
      const { stopped, elapsedMs } = await findAsync({}, undefined, later.signal);

      expect(stopped).toBeUndefined();
      expect(elapsedMs).toBeLessThan(STOPPED_OWNER_WINDOW_MS);
    });
  });

  describe('isDaemonOwnerStillStopped', () => {
    const stopped: IStoppedProcess = { pid: process.pid, startTicks: START_TICKS };

    it('holds while the record names the same stopped process, which has the record open', () => {
      expect(isDaemonOwnerStillStopped(paths, stopped, readers())).toBe(true);
      expect(isDaemonOwnerStillStopped(paths, stopped, readers({ readState: () => TRACED }))).toBe(true);
    });

    it('ends once that process resumes, exits or no longer has the record open, or the record changes', () => {
      expect(isDaemonOwnerStillStopped(paths, stopped, readers({ readState: () => WAITING }))).toBe(false);
      expect(isDaemonOwnerStillStopped(paths, stopped, readers({ readState: () => undefined }))).toBe(false);
      expect(
        isDaemonOwnerStillStopped(
          paths,
          stopped,
          readers({ readState: () => ({ ...STOPPED, startTicks: START_TICKS + 1 }) })
        )
      ).toBe(false);
      expect(isDaemonOwnerStillStopped(paths, stopped, readers({ hasFileOpen: () => false }))).toBe(false);

      // The record names another live process, even one that is stopped and has the record open.
      recordDaemonOwner(paths, process.ppid);
      expect(isDaemonOwnerStillStopped(paths, stopped, readers({ hasFileOpen: () => true }))).toBe(false);
      fs.unlinkSync(paths.lockfilePath);
      expect(isDaemonOwnerStillStopped(paths, stopped, readers())).toBe(false);
    });
  });
});
