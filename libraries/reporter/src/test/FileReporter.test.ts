// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  FileReporter,
  RUSH_LOGS_DIR_NAME,
  LATEST_LOG_NAME,
  type IFileReporterArtifact,
  type IReporterEventEnvelope
} from '../index';

const FIXED_NOW: number = Date.UTC(2026, 6, 15, 1, 0, 0);
const MS_PER_DAY: number = 24 * 60 * 60 * 1000;

function ev(
  type: string,
  payload: unknown = {},
  privacy: string = 'public'
): IReporterEventEnvelope<unknown> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    eventId: 'evt',
    sessionId: 'sess',
    sequence: 1,
    timestamp: '2026-07-15T01:00:00.000Z',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy,
    required: true,
    type,
    payload
  } as unknown as IReporterEventEnvelope<unknown>;
}

async function withTempDir(action: (directory: string) => Promise<void>): Promise<void> {
  const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-file-reporter-'));
  try {
    await action(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

describe('FileReporter', () => {
  it('streams events after initialization instead of retaining the full log', async () => {
    await withTempDir(async (base: string) => {
      const reporter: FileReporter = new FileReporter({ commonTempFolder: base, nowMs: () => FIXED_NOW });
      await reporter.initializeAsync();
      reporter.report(ev('externalOutput', { text: 'streamed immediately' }));

      const content: string = await fs.promises.readFile(reporter.getArtifact().path!, 'utf8');
      expect(content).toContain('streamed immediately');
      await reporter.closeAsync();
    });
  });

  it('writes a grouped full-detail log with owner-only permissions and a latest.log pointer', async () => {
    await withTempDir(async (base: string) => {
      const reporter: FileReporter = new FileReporter({
        commonTempFolder: base,
        actionName: 'build',
        pid: 4242,
        nowMs: () => FIXED_NOW
      });
      await reporter.initializeAsync();
      reporter.report(ev('commandStarted', { commandName: 'build' }));
      reporter.report(
        ev('operationRegistered', {
          operationId: 'project#build',
          projectName: 'project',
          phaseName: 'build'
        })
      );
      reporter.report({
        ...ev('externalOutput', { stream: 'stdout', text: 'Building...\n' }),
        scope: { operationId: 'project#build' }
      });
      reporter.report(ev('operationStatusChanged', { operationId: 'project#build', status: 'success' }));
      reporter.report(ev('operationCompleted', { operationId: 'project#build', status: 'success' }));
      reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
      await reporter.closeAsync();

      const artifact: IFileReporterArtifact = reporter.getArtifact();
      expect(artifact.available).toBe(true);
      expect(artifact.path).toContain(path.join(base, RUSH_LOGS_DIR_NAME));
      expect(path.basename(artifact.path!)).toBe('2026-07-15T01-00-00-000Z-4242-build.log');

      const content: string = await fs.promises.readFile(artifact.path!, 'utf8');
      expect(content).toContain('"type":"commandStarted"');
      expect(content).toContain('==[ project (build) ]==');
      expect(content).toContain('Building...\n==[ project#build: success ]==');
      expect(content).toContain('"type":"commandResult"');

      const latestPath: string = path.join(base, RUSH_LOGS_DIR_NAME, LATEST_LOG_NAME);
      expect(fs.existsSync(latestPath)).toBe(true);

      if (process.platform !== 'win32') {
        const stats: fs.Stats = await fs.promises.stat(artifact.path!);
        expect(stats.mode % 0o1000).toBe(0o600);
      }
    });
  });

  it('maintains latest.log for a failed command too', async () => {
    await withTempDir(async (base: string) => {
      const reporter: FileReporter = new FileReporter({
        commonTempFolder: base,
        actionName: 'build',
        nowMs: () => FIXED_NOW
      });
      reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
      await reporter.closeAsync();

      expect(fs.existsSync(path.join(base, RUSH_LOGS_DIR_NAME, LATEST_LOG_NAME))).toBe(true);
    });
  });

  it('refreshes the latest.log copy when symlinks are unavailable', async () => {
    await withTempDir(async (base: string) => {
      const symlinkSpy: jest.SpiedFunction<typeof fs.promises.symlink> = jest
        .spyOn(fs.promises, 'symlink')
        .mockRejectedValueOnce(new Error('symlinks unavailable'));
      try {
        const reporter: FileReporter = new FileReporter({
          commonTempFolder: base,
          actionName: 'build',
          nowMs: () => FIXED_NOW
        });
        reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
        await reporter.closeAsync();

        const latestPath: string = path.join(base, RUSH_LOGS_DIR_NAME, LATEST_LOG_NAME);
        expect(await fs.promises.readFile(latestPath, 'utf8')).toContain('"type":"commandResult"');
      } finally {
        symlinkSpy.mockRestore();
      }
    });
  });

  it('preserves stdout and stderr chunk order while grouping parallel operations', async () => {
    await withTempDir(async (base: string) => {
      const reporter: FileReporter = new FileReporter({ commonTempFolder: base, nowMs: () => FIXED_NOW });
      await reporter.initializeAsync();
      for (const operationId of ['a', 'b']) {
        reporter.report(
          ev('operationRegistered', {
            operationId,
            projectName: `project-${operationId}`,
            phaseName: 'build'
          })
        );
      }
      reporter.report({
        ...ev('externalOutput', { stream: 'stdout', text: 'a-out\n' }),
        scope: { operationId: 'a' }
      });
      reporter.report({
        ...ev('externalOutput', { stream: 'stdout', text: 'b-out\n' }),
        scope: { operationId: 'b' }
      });
      reporter.report({
        ...ev('externalOutput', { stream: 'stderr', text: 'a-err\n' }),
        scope: { operationId: 'a' }
      });
      reporter.report(ev('operationStatusChanged', { operationId: 'a', status: 'failure' }));
      reporter.report(ev('operationCompleted', { operationId: 'a', status: 'failure' }));
      reporter.report(ev('operationStatusChanged', { operationId: 'b', status: 'blocked' }));
      reporter.report(ev('operationCompleted', { operationId: 'b', status: 'blocked' }));
      await reporter.closeAsync();

      const content: string = await fs.promises.readFile(reporter.getArtifact().path!, 'utf8');
      expect(content).toContain('a-out\na-err\n==[ a: failure ]==');
      expect(content).toContain('b-out\n==[ b: blocked ]==');
      expect(content.indexOf('a-out')).toBeLessThan(content.indexOf('a-err'));
    });
  });

  it('excludes secret fields but keeps local-sensitive values', async () => {
    await withTempDir(async (base: string) => {
      const reporter: FileReporter = new FileReporter({ commonTempFolder: base, nowMs: () => FIXED_NOW });
      reporter.report(
        ev('diagnosticEmitted', {
          code: 'RUSH_DEPENDENCY_TOOL_FAILED',
          category: 'dependency-tool',
          severity: 'error',
          parameters: {
            token: { value: 'sk-secret-value', privacy: 'secret' },
            logPath: { value: '/home/user/install.log', privacy: 'local-sensitive' }
          }
        })
      );
      await reporter.closeAsync();

      const content: string = await fs.promises.readFile(reporter.getArtifact().path!, 'utf8');
      expect(content).not.toContain('sk-secret-value');
      expect(content).toContain('[secret]');
      expect(content).toContain('/home/user/install.log');
    });
  });

  it('deletes logs older than the retention window and caps the session count', async () => {
    await withTempDir(async (base: string) => {
      const logsDir: string = path.join(base, RUSH_LOGS_DIR_NAME);
      await fs.promises.mkdir(logsDir, { recursive: true });

      const oldLog: string = path.join(logsDir, 'old-1-build.log');
      await fs.promises.writeFile(oldLog, '{}\n');
      const oldTime: Date = new Date(FIXED_NOW - 20 * MS_PER_DAY);
      await fs.promises.utimes(oldLog, oldTime, oldTime);

      // Create more than the cap of recent logs.
      for (let i: number = 0; i < 22; i++) {
        const recent: string = path.join(logsDir, `recent-${i}-build.log`);
        await fs.promises.writeFile(recent, '{}\n');
        const time: Date = new Date(FIXED_NOW - (i + 1) * 1000);
        await fs.promises.utimes(recent, time, time);
      }

      const reporter: FileReporter = new FileReporter({
        commonTempFolder: base,
        maxSessions: 20,
        nowMs: () => FIXED_NOW
      });
      reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
      await reporter.closeAsync();

      const remaining: string[] = (await fs.promises.readdir(logsDir)).filter(
        (name: string) => name.endsWith('.log') && name !== LATEST_LOG_NAME
      );
      expect(remaining).not.toContain('old-1-build.log');
      expect(remaining.length).toBe(20);
    });
  });

  it('falls back to the OS temp folder when the repository path fails', async () => {
    await withTempDir(async (base: string) => {
      const blocker: string = path.join(base, 'blocker');
      await fs.promises.writeFile(blocker, 'not a directory');
      const osTemp: string = path.join(base, 'os-temp');
      await fs.promises.mkdir(osTemp);

      const reporter: FileReporter = new FileReporter({
        commonTempFolder: blocker,
        osTempFolder: osTemp,
        nowMs: () => FIXED_NOW
      });
      reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
      await reporter.closeAsync();

      const artifact: IFileReporterArtifact = reporter.getArtifact();
      expect(artifact.available).toBe(true);
      expect(path.dirname(artifact.path!).startsWith(path.join(osTemp, `${RUSH_LOGS_DIR_NAME}-`))).toBe(true);
      if (process.platform !== 'win32') {
        const directoryStats: fs.Stats = await fs.promises.stat(path.dirname(artifact.path!));
        expect(directoryStats.mode % 0o1000).toBe(0o700);
      }
    });
  });

  it('treats failure at both paths as nonfatal with an emergency warning', async () => {
    await withTempDir(async (base: string) => {
      const repoBlocker: string = path.join(base, 'repo-blocker');
      const osBlocker: string = path.join(base, 'os-blocker');
      await fs.promises.writeFile(repoBlocker, 'file');
      await fs.promises.writeFile(osBlocker, 'file');

      const warnings: string[] = [];
      const reporter: FileReporter = new FileReporter({
        commonTempFolder: repoBlocker,
        osTempFolder: osBlocker,
        nowMs: () => FIXED_NOW,
        emergencyWarn: (message: string) => warnings.push(message)
      });
      reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
      await reporter.closeAsync();

      expect(reporter.getArtifact().available).toBe(false);
      expect(warnings.some((w: string) => w.includes('artifact is unavailable'))).toBe(true);
    });
  });
});
