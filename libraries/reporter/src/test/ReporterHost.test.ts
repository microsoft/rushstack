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
      buffer.emit({ type: 'sessionStarted', required: true, payload: {} });
      buffer.emit({ type: 'commandStarted', required: true, payload: { commandName: 'build' } });
      const handoffPath: string = await writeBootstrapHandoffFileAsync(buffer, { directory });

      const manager: ReporterManager = new ReporterManager();
      const reporter: RecordingReporter = new RecordingReporter();
      manager.addReporter(reporter);
      await manager.initializeAsync();

      const host: ReporterHost = new ReporterHost({
        manager,
        env: { [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath }
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
    const host: ReporterHost = new ReporterHost({
      env: { [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: '/nonexistent/rush-handoff.ndjson' }
    });
    const result: IBootstrapReplayResult = await host.replayBootstrapHandoffAsync();
    expect(result.direct).toBe(false);
    expect(result.replayed).toBe(false);
    expect(result.eventCount).toBe(0);
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
      required: true,
      type: 'commandStarted',
      payload: {}
    });
    await manager.flushAsync();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].type).toBe('commandStarted');
  });
});

describe('ReporterHost abandoned file cleanup', () => {
  it('deletes only stale handoff files and leaves other files untouched', async () => {
    await withTempDir(async (directory: string) => {
      const oldFile: string = path.join(directory, 'rush-reporter-bootstrap-1-1000.ndjson');
      const newFile: string = path.join(directory, 'rush-reporter-bootstrap-2-2000.ndjson');
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
});
