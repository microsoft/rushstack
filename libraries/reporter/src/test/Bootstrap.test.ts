// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  parseEarlyReporterControls,
  BootstrapEventBuffer,
  writeBootstrapHandoffFileAsync,
  readBootstrapHandoffFileAsync,
  deleteBootstrapHandoffFileAsync,
  BOOTSTRAP_PROTOCOL_MAJOR,
  BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  REPORTER_PROTOCOL_VERSION,
  type IBootstrapEventBufferOptions,
  type IEarlyReporterControls
} from '../index';

function decode(ndjson: string): Record<string, unknown>[] {
  return ndjson
    .trim()
    .split('\n')
    .filter((line: string) => line.length > 0)
    .map((line: string) => JSON.parse(line) as Record<string, unknown>);
}

function makeBuffer(overrides?: Partial<IBootstrapEventBufferOptions>): BootstrapEventBuffer {
  return new BootstrapEventBuffer({
    sessionId: 'sess_boot',
    source: { packageName: 'install-run-rush', packageVersion: '0.0.0' },
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides
  });
}

describe('parseEarlyReporterControls', () => {
  it('reads the reporter and log level from flags', () => {
    const controls: IEarlyReporterControls = parseEarlyReporterControls(
      ['build', '--reporter=json', '--log-level', 'verbose'],
      {}
    );
    expect(controls).toEqual({ reporter: 'json', logLevel: 'verbose' });
  });

  it('maps verbosity aliases to log levels', () => {
    expect(parseEarlyReporterControls(['build', '--debug'], {}).logLevel).toBe('debug');
    expect(parseEarlyReporterControls(['build', '--verbose'], {}).logLevel).toBe('verbose');
    expect(parseEarlyReporterControls(['build', '-q'], {}).logLevel).toBe('quiet');
  });

  it('falls back to environment variables and prefers explicit flags', () => {
    expect(parseEarlyReporterControls([], { RUSH_REPORTER: 'ai', RUSH_LOG_LEVEL: 'debug' })).toEqual({
      reporter: 'ai',
      logLevel: 'debug'
    });
    expect(parseEarlyReporterControls([], { RUSH_QUIET_MODE: '1' }).logLevel).toBe('quiet');
    expect(parseEarlyReporterControls(['--reporter=plaintext'], { RUSH_REPORTER: 'ai' }).reporter).toBe(
      'plaintext'
    );
  });

  it('returns an empty object when nothing is specified', () => {
    expect(parseEarlyReporterControls(['build'], {})).toEqual({});
  });
});

describe('BootstrapEventBuffer', () => {
  it('freezes a protocol major that matches the source of truth', () => {
    expect(BOOTSTRAP_PROTOCOL_MAJOR).toBe(REPORTER_PROTOCOL_VERSION.major);
  });

  it('encodes events with assigned ids, sequence, timestamp, and protocol version', () => {
    const buffer: BootstrapEventBuffer = makeBuffer();
    const id: string = buffer.emit({ type: 'sessionStarted', required: true, payload: { argv: ['build'] } });
    expect(id).toBe('boot_1');

    const events: Record<string, unknown>[] = decode(buffer.serialize());
    expect(events).toHaveLength(1);
    expect(events[0].protocolVersion).toEqual({ major: 1, minor: 0 });
    expect(events[0].eventId).toBe('boot_1');
    expect(events[0].sequence).toBe(1);
    expect(events[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(events[0].type).toBe('sessionStarted');
    expect(buffer.truncation.truncated).toBe(false);
  });

  it('splits raw external output into 64 KiB chunks and preserves the text', () => {
    const buffer: BootstrapEventBuffer = makeBuffer();
    const text: string = 'x'.repeat(200000);
    buffer.addExternalOutput('stdout', text);

    const events: Record<string, unknown>[] = decode(buffer.serialize());
    const chunks: Record<string, unknown>[] = events.filter(
      (e: Record<string, unknown>) => e.type === 'externalOutput'
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const payload: { stream: string; text: string } = chunk.payload as {
        stream: string;
        text: string;
      };
      expect(Buffer.byteLength(payload.text, 'utf8')).toBeLessThanOrEqual(64 * 1024);
    }
    const reconstructed: string = chunks
      .map((e: Record<string, unknown>) => (e.payload as { text: string }).text)
      .join('');
    expect(reconstructed).toBe(text);
  });

  it('preserves required and diagnostic events on overflow and appends a bufferTruncated event', () => {
    const buffer: BootstrapEventBuffer = makeBuffer({ maxBytes: 600 });
    buffer.emit({ type: 'sessionStarted', required: true, payload: {} });
    for (let i: number = 0; i < 40; i++) {
      buffer.emit({ type: 'activityChanged', required: false, payload: { i } });
    }
    buffer.emit({ type: 'diagnosticEmitted', required: false, payload: { code: 'RUSH_X' } });

    const events: Record<string, unknown>[] = decode(buffer.serialize());
    const types: string[] = events.map((e: Record<string, unknown>) => e.type as string);

    expect(types).toContain('sessionStarted');
    expect(types).toContain('diagnosticEmitted');
    expect(types.filter((t: string) => t === 'activityChanged').length).toBeLessThan(40);
    expect(buffer.truncation.truncated).toBe(true);
    expect(buffer.failed).toBe(false);

    const notice: Record<string, unknown> = events[events.length - 1];
    expect(notice.type).toBe('extension');
    expect((notice.payload as { name: string }).name).toBe(BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME);
    expect((notice.payload as { droppedReplaceable: number }).droppedReplaceable).toBeGreaterThan(0);
  });

  it('fails the bootstrap when a required event cannot be preserved', () => {
    const buffer: BootstrapEventBuffer = makeBuffer({ maxBytes: 20 });
    buffer.emit({ type: 'sessionStarted', required: true, payload: {} });

    expect(buffer.failed).toBe(true);
    expect(buffer.truncation.droppedRequired).toBe(1);

    const events: Record<string, unknown>[] = decode(buffer.serialize());
    const notice: Record<string, unknown> = events[events.length - 1];
    expect(notice.type).toBe('extension');
    expect((notice.payload as { failed: boolean }).failed).toBe(true);
  });
});

describe('bootstrap handoff', () => {
  it('exposes the private handoff environment variable name', () => {
    expect(RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR).toBe('_RUSH_REPORTER_BOOTSTRAP_HANDOFF');
  });

  it('writes, reads, and deletes a handoff file', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-boot-test-'));
    try {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', required: true, payload: { argv: ['build'] } });
      buffer.emit({ type: 'commandStarted', required: true, payload: { commandName: 'build' } });

      const filePath: string = await writeBootstrapHandoffFileAsync(buffer, {
        directory,
        pid: 4242
      });
      expect(filePath.startsWith(directory)).toBe(true);
      expect(filePath).toContain('4242');

      const events: unknown[] = await readBootstrapHandoffFileAsync(filePath);
      expect(events).toHaveLength(2);
      expect((events[0] as Record<string, unknown>).type).toBe('sessionStarted');
      expect((events[1] as Record<string, unknown>).type).toBe('commandStarted');

      await deleteBootstrapHandoffFileAsync(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
      // Deleting a missing file is a no-op.
      await deleteBootstrapHandoffFileAsync(filePath);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
