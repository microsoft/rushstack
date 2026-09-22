// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ReporterHost,
  ReporterManager,
  BootstrapEventBuffer,
  writeBootstrapHandoffFileAsync,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR,
  type IBootstrapReplayResult,
  type IReporter,
  type IReporterEventEnvelope,
  type IReporterEventSink
} from '../index';

class RecordingReporter implements IReporter {
  public readonly name: string = 'recording';
  public readonly reported: IReporterEventEnvelope<unknown>[] = [];

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this.reported.push(event);
  }

  public async flushAsync(): Promise<void> {
    /* no-op */
  }

  public async closeAsync(): Promise<void> {
    /* no-op */
  }
}

async function withTempDir(action: (directory: string) => Promise<void>): Promise<void> {
  const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-host-test-'));
  try {
    await action(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

function makeBuffer(): BootstrapEventBuffer {
  return new BootstrapEventBuffer({
    sessionId: 'sess_boot',
    source: { packageName: 'install-run-rush', packageVersion: '0.0.0' },
    now: () => '2026-01-01T00:00:00.000Z'
  });
}

describe('ReporterHost handoff replay', () => {
  it('replays the handoff file into the manager and deletes it', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      buffer.emit({ type: 'commandStarted', payload: { commandName: 'build' } });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });

      const manager: ReporterManager = new ReporterManager();
      const reporter: RecordingReporter = new RecordingReporter();
      manager.addReporter(reporter);
      await manager.initializeAsync();

      const host: ReporterHost = new ReporterHost({
        manager,
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory
      });

      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      await manager.flushAsync();

      expect(result.direct).toBe(false);
      expect(result.replayed).toBe(true);
      expect(result.eventCount).toBe(2);
      expect(fs.existsSync(handoffPath)).toBe(false);

      expect(reporter.reported.map((e: IReporterEventEnvelope<unknown>) => e.type)).toEqual([
        'sessionStarted',
        'commandStarted'
      ]);
      // Foreign events are rehomed with a new global sequence and preserved source sequence.
      expect(reporter.reported[0].sequence).toBe(1);
      expect(reporter.reported[0].sourceSequence).toBe(1);
    });
  });

  it('skips replay for a direct invocation with no handoff variable', async () => {
    const host: ReporterHost = new ReporterHost({ env: {} });
    const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
    expect(result).toEqual({ direct: true, replayed: false, eventCount: 0 });
  });

  it('tolerates a missing handoff file', async () => {
    await withTempDir(async (directory: string) => {
      const handoffPath: string = path.join(directory, 'rush-reporter-bootstrap-missing.ndjson');
      const host: ReporterHost = new ReporterHost({
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: 'missing'
        },
        handoffDirectory: directory
      });
      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      expect(result.direct).toBe(false);
      expect(result.replayed).toBe(false);
      expect(result.eventCount).toBe(0);
      expect(result.skipReason).toBe('unreadable');
    });
  });

  it('rejects a handoff file whose nonce does not match the environment', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath } = await writeBootstrapHandoffFileAsync(buffer, { directory });

      const manager: ReporterManager = new ReporterManager();
      const reporter: RecordingReporter = new RecordingReporter();
      manager.addReporter(reporter);
      await manager.initializeAsync();

      const host: ReporterHost = new ReporterHost({
        manager,
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: 'not-the-real-nonce'
        },
        handoffDirectory: directory
      });

      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      await manager.flushAsync();

      expect(result.replayed).toBe(false);
      expect(result.skipReason).toBe('nonce-mismatch');
      expect(reporter.reported).toHaveLength(0);
      expect(fs.existsSync(handoffPath)).toBe(true);
    });
  });

  it('rejects a missing nonce and leaves the unauthenticated file untouched', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const host: ReporterHost = new ReporterHost({
        env: { [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath },
        handoffDirectory: directory
      });

      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      expect(result.skipReason).toBe('nonce-mismatch');
      expect(fs.existsSync(handoffPath)).toBe(true);
    });
  });

  it('rejects a handoff outside the configured directory without deleting it', async () => {
    await withTempDir(async (directory: string) => {
      const unrelatedPath: string = path.join(directory, 'unrelated.txt');
      await fs.promises.writeFile(unrelatedPath, 'keep me');
      const host: ReporterHost = new ReporterHost({
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: unrelatedPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: 'nonce'
        },
        handoffDirectory: directory
      });

      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      expect(result.skipReason).toBe('invalid-path');
      expect(await fs.promises.readFile(unrelatedPath, 'utf8')).toBe('keep me');
    });
  });

  it('rejects an incompatible bootstrap protocol', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      buffer.addExternalOutput('stderr', 'legacy bootstrap output\n');
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const contents: string = await fs.promises.readFile(handoffPath, 'utf8');
      await fs.promises.writeFile(handoffPath, contents.replace('"major":1', '"major":2'));

      const manager: ReporterManager = new ReporterManager();
      await manager.initializeAsync();
      const host: ReporterHost = new ReporterHost({
        manager,
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory
      });
      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      expect(result.skipReason).toBe('incompatible-protocol');
      expect(result.legacyFallbackOutput).toEqual([{ stream: 'stderr', text: 'legacy bootstrap output\n' }]);
    });
  });

  it('does not duplicate already-rendered output during legacy fallback', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({
        type: 'externalOutput',
        privacy: 'local-sensitive',
        payload: { stream: 'stdout', text: 'live output\n', wasRendered: true }
      });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const contents: string = await fs.promises.readFile(handoffPath, 'utf8');
      await fs.promises.writeFile(handoffPath, contents.replace('"major":1', '"major":2'));

      const manager: ReporterManager = new ReporterManager();
      await manager.initializeAsync();
      const host: ReporterHost = new ReporterHost({
        manager,
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory
      });
      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();

      expect(result.skipReason).toBe('incompatible-protocol');
      expect(result.legacyFallbackOutput).toBeUndefined();
      expect(fs.existsSync(handoffPath)).toBe(false);
    });
  });

  it('replays a valid prefix before a malformed trailing record', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      await fs.promises.appendFile(handoffPath, '{"truncated":');

      const manager: ReporterManager = new ReporterManager();
      const reporter: RecordingReporter = new RecordingReporter();
      manager.addReporter(reporter);
      await manager.initializeAsync();
      const host: ReporterHost = new ReporterHost({
        manager,
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory
      });

      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      await manager.flushAsync();
      expect(result).toMatchObject({ replayed: true, eventCount: 1, skippedEventCount: 1 });
      expect(reporter.reported).toHaveLength(1);
    });
  });

  it('lets a 1.0 consumer skip an unknown optional 1.1 event and replay the remaining stream', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      buffer.emit({ type: 'diagnosticEmitted', payload: {} });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const lines: string[] = (await fs.promises.readFile(handoffPath, 'utf8')).trimEnd().split('\n');
      const unknownEvent: Record<string, unknown> = {
        ...(JSON.parse(lines[1]) as Record<string, unknown>),
        eventId: 'future_1',
        type: 'futureMinorEvent',
        required: false,
        protocolVersion: { major: 1, minor: 1 }
      };
      lines.splice(2, 0, JSON.stringify(unknownEvent));
      await fs.promises.writeFile(handoffPath, `${lines.join('\n')}\n`);

      const manager: ReporterManager = new ReporterManager({
        protocolVersion: { major: 1, minor: 0 }
      });
      const reporter: RecordingReporter = new RecordingReporter();
      manager.addReporter(reporter);
      await manager.initializeAsync();
      const host: ReporterHost = new ReporterHost({
        manager,
        supportedProtocolVersion: { major: 1, minor: 0 },
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory
      });

      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      await manager.flushAsync();
      expect(result).toMatchObject({ replayed: true, eventCount: 2, skippedEventCount: 1 });
      expect(reporter.reported.map((event) => event.type)).toEqual(['sessionStarted', 'diagnosticEmitted']);
    });
  });

  it('rejects an unknown required event from a newer minor', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const lines: string[] = (await fs.promises.readFile(handoffPath, 'utf8')).trimEnd().split('\n');
      const unknownEvent: Record<string, unknown> = {
        ...(JSON.parse(lines[1]) as Record<string, unknown>),
        eventId: 'future_required_1',
        type: 'futureRequiredEvent',
        protocolVersion: { major: 1, minor: 1 }
      };
      lines.push(JSON.stringify(unknownEvent));
      await fs.promises.writeFile(handoffPath, `${lines.join('\n')}\n`);

      const manager: ReporterManager = new ReporterManager();
      await manager.initializeAsync();
      const host: ReporterHost = new ReporterHost({
        manager,
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory
      });

      const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
      expect(result).toMatchObject({ replayed: false, skipReason: 'unsupported-required-event' });
    });
  });
});

describe('ReporterHost handoff discard', () => {
  it('deletes only the current authenticated handoff', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const host: ReporterHost = new ReporterHost({
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory
      });

      await host.discardBootstrapHandoffAsync();
      expect(fs.existsSync(handoffPath)).toBe(false);
    });
  });

  it('does not delete a handoff with a mismatched nonce', async () => {
    await withTempDir(async (directory: string) => {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const host: ReporterHost = new ReporterHost({
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: 'wrong-nonce'
        },
        handoffDirectory: directory
      });

      await host.discardBootstrapHandoffAsync();
      expect(fs.existsSync(handoffPath)).toBe(true);
    });
  });
});

describe('ReporterHost sink', () => {
  it('exposes a typed sink that emits into the manager', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const host: ReporterHost = new ReporterHost({ manager, env: {} });
    const sink: IReporterEventSink = host.getSink();
    sink.emit({
      protocolVersion: { major: 1, minor: 0 },
      sessionId: 'sess',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
      privacy: 'public',
      type: 'commandStarted',
      payload: {}
    });
    await manager.flushAsync();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].type).toBe('commandStarted');
  });
});

describe('ReporterHost abandoned file cleanup', () => {
  const deadPid: number = 99999999;

  beforeEach(() => {
    const userInfo: os.UserInfo<string> = os.userInfo();
    jest
      .spyOn(jest.requireActual<typeof os>('node:os'), 'userInfo')
      .mockReturnValue({ ...userInfo, uid: fs.statSync(os.tmpdir()).uid });
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes only stale handoff files and leaves other files untouched', async () => {
    await withTempDir(async (directory: string) => {
      const oldFile: string = path.join(directory, `rush-reporter-bootstrap-${deadPid}-1000.ndjson`);
      const newFile: string = path.join(directory, `rush-reporter-bootstrap-${deadPid}-2000.ndjson`);
      const otherFile: string = path.join(directory, 'unrelated.txt');
      await fs.promises.writeFile(oldFile, '{}\n');
      await fs.promises.writeFile(newFile, '{}\n');
      await fs.promises.writeFile(otherFile, 'keep me');

      const thirtyDaysAgo: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await fs.promises.utimes(oldFile, thirtyDaysAgo, thirtyDaysAgo);

      const host: ReporterHost = new ReporterHost({ env: {}, handoffDirectory: directory });
      const deleted: string[] = await host.cleanAbandonedHandoffFilesAsync();

      expect(deleted).toEqual([oldFile]);
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(newFile)).toBe(true);
      expect(fs.existsSync(otherFile)).toBe(true);
    });
  });

  it('retains 20 recent abandoned sessions with deterministic timestamp ties', async () => {
    await withTempDir(async (directory: string) => {
      const files: string[] = [];
      const timestamp: Date = new Date('2026-09-01T00:00:00Z');
      for (let index: number = 20; index >= 0; index--) {
        const filePath: string = path.join(
          directory,
          `rush-reporter-bootstrap-${deadPid}-${String(index).padStart(3, '0')}.ndjson`
        );
        await fs.promises.writeFile(filePath, '{}\n', { mode: 0o600 });
        await fs.promises.utimes(filePath, timestamp, timestamp);
        files.push(filePath);
      }
      const host: ReporterHost = new ReporterHost({
        env: {},
        handoffDirectory: directory,
        nowMs: () => Date.parse('2026-09-09T00:00:00Z')
      });

      expect(await host.cleanAbandonedHandoffFilesAsync()).toEqual([files[0]]);
      expect((await fs.promises.readdir(directory)).length).toBe(20);
      expect(await host.cleanAbandonedHandoffFilesAsync()).toEqual([]);
    });
  });

  it('protects live, current, foreign-owned and non-file entries regardless of age', async () => {
    await withTempDir(async (directory: string) => {
      const livePid: number = 88888888;
      const currentHandoff: string = path.join(
        directory,
        `rush-reporter-bootstrap-${deadPid}-current.ndjson`
      );
      const foreign: string = path.join(directory, `rush-reporter-bootstrap-${deadPid}-foreign.ndjson`);
      const protectedPaths: string[] = [
        currentHandoff,
        foreign,
        path.join(directory, `rush-reporter-bootstrap-${process.pid}-self.ndjson`),
        path.join(directory, `rush-reporter-bootstrap-${livePid}-live.ndjson`)
      ];
      const old: Date = new Date('2000-01-01T00:00:00Z');
      for (const filePath of protectedPaths) {
        await fs.promises.writeFile(filePath, '{}\n');
        await fs.promises.utimes(filePath, old, old);
      }
      const directoryEntry: string = path.join(
        directory,
        `rush-reporter-bootstrap-${deadPid}-directory.ndjson`
      );
      await fs.promises.mkdir(directoryEntry);
      const originalLstat: typeof fs.promises.lstat = fs.promises.lstat;
      jest.spyOn(fs.promises, 'lstat').mockImplementation(async (filePath) => {
        const stats: fs.Stats = await originalLstat(filePath);
        if (filePath === foreign) {
          stats.uid++;
        }
        return stats;
      });
      jest.mocked(process.kill).mockImplementation((pid) => {
        if (pid === livePid) {
          throw Object.assign(new Error('Not permitted'), { code: 'EPERM' });
        }
        throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
      });
      const host: ReporterHost = new ReporterHost({
        env: { [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: currentHandoff },
        handoffDirectory: directory
      });

      expect(await host.cleanAbandonedHandoffFilesAsync()).toEqual([]);
      for (const filePath of [...protectedPaths, directoryEntry]) {
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });
  });
});
