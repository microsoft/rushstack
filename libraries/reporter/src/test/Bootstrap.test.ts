// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { assertSelfContainedBootstrapSource } from '../../scripts/generateBootstrapProtocol';
import {
  parseEarlyReporterControls,
  BootstrapEventBuffer,
  writeBootstrapHandoffFileAsync,
  readBootstrapHandoffFileAsync,
  deleteBootstrapHandoffFileAsync,
  BOOTSTRAP_PROTOCOL_MAJOR,
  BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  isReporterExtensionEventName,
  REPORTER_PROTOCOL_VERSION,
  type IBootstrapEventBufferOptions,
  type IEarlyReporterControls
} from '../index';
import { encodeBootstrapEnvelope } from '../bootstrap/BootstrapProtocol';

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

describe('bootstrap protocol generation', () => {
  it.each([
    { description: 'static imports', source: "import { value } from 'pkg';" },
    { description: 'import-equals declarations', source: "import value = require('pkg');" },
    { description: 'import types', source: "type Value = import('pkg').Value;" },
    { description: 'dynamic imports', source: "const value = import('pkg');" },
    { description: 'export-from declarations', source: "export { value } from 'pkg';" },
    { description: 'export-all declarations', source: "export * from 'pkg';" },
    { description: 'import.meta expressions', source: 'const url = import.meta.url;' },
    { description: 'require calls', source: "const value = require('pkg');" },
    { description: 'require property calls', source: "const path = require.resolve('pkg');" }
  ])('rejects $description', ({ source }: { source: string }) => {
    expect(() => assertSelfContainedBootstrapSource(source)).toThrow(
      'The generated bootstrap protocol must be self-contained'
    );
  });

  it('allows import-like text without module edges', () => {
    const source: string = [
      "/* import { value } from 'pkg'; */",
      `const message: string = "import('pkg')";`,
      'export const value: string = message;'
    ].join('\n');

    expect(() => assertSelfContainedBootstrapSource(source)).not.toThrow();
  });
});

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
    expect(parseEarlyReporterControls(['--debug'], { RUSH_LOG_LEVEL: 'quiet' }).logLevel).toBe('debug');
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

  it('encodes the frozen bootstrap envelope deterministically', () => {
    expect(
      encodeBootstrapEnvelope({
        eventId: 'boot_1',
        sessionId: 'sess_boot',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        source: { packageName: 'install-run-rush', packageVersion: '0.0.0' },
        privacy: 'public',
        required: true,
        type: 'sessionStarted',
        payload: { argv: ['build'] }
      })
    ).toBe(
      '{"protocolVersion":{"major":1,"minor":0},"eventId":"boot_1","sessionId":"sess_boot",' +
        '"sequence":1,"timestamp":"2026-01-01T00:00:00.000Z","source":{"packageName":' +
        '"install-run-rush","packageVersion":"0.0.0"},"privacy":"public","required":true,' +
        '"type":"sessionStarted","payload":{"argv":["build"]}}'
    );
  });

  it('encodes events with assigned ids, sequence, timestamp, and protocol version', () => {
    const buffer: BootstrapEventBuffer = makeBuffer();
    const id: string = buffer.emit({ type: 'sessionStarted', payload: { argv: ['build'] } });
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

  it('preserves an explicit null payload', () => {
    const buffer: BootstrapEventBuffer = makeBuffer();
    buffer.emit({ type: 'extension', payload: null });

    expect(decode(buffer.serialize())[0].payload).toBeNull();
  });

  it('splits raw external output into 64 KiB chunks and preserves the text', () => {
    const buffer: BootstrapEventBuffer = makeBuffer();
    const text: string = `${'x'.repeat(65535)}😀${'y'.repeat(200000)}`;
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
      const finalCodeUnit: number = payload.text.charCodeAt(payload.text.length - 1);
      expect(finalCodeUnit < 0xd800 || finalCodeUnit > 0xdbff).toBe(true);
      expect(chunk.privacy).toBe('local-sensitive');
      expect(chunk.required).toBe(true);
    }
    const reconstructed: string = chunks
      .map((e: Record<string, unknown>) => (e.payload as { text: string }).text)
      .join('');
    expect(reconstructed).toBe(text);
  });

  it('preserves required and diagnostic events on overflow and appends a bufferTruncated event', () => {
    const maxBytes: number = 1200;
    const buffer: BootstrapEventBuffer = makeBuffer({ maxBytes });
    buffer.emit({ type: 'sessionStarted', payload: {} });
    for (let i: number = 0; i < 40; i++) {
      buffer.emit({ type: 'activityChanged', payload: { i } });
    }
    buffer.emit({ type: 'diagnosticEmitted', payload: { code: 'RUSH_X' } });

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
    expect(isReporterExtensionEventName(BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME)).toBe(true);
    expect((notice.payload as { droppedReplaceable: number }).droppedReplaceable).toBeGreaterThan(0);
    expect(Buffer.byteLength(buffer.serialize(), 'utf8')).toBeLessThanOrEqual(maxBytes);
  });

  it('fails the bootstrap when a required event cannot be preserved', () => {
    const buffer: BootstrapEventBuffer = makeBuffer({ maxBytes: 600 });
    buffer.emit({ type: 'sessionStarted', payload: { text: 'x'.repeat(1000) } });

    expect(buffer.failed).toBe(true);
    expect(buffer.truncation.droppedRequired).toBe(1);

    const events: Record<string, unknown>[] = decode(buffer.serialize());
    const notice: Record<string, unknown> = events[events.length - 1];
    expect(notice.type).toBe('extension');
    expect((notice.payload as { failed: boolean }).failed).toBe(true);
  });

  it('fails rather than dropping required external output when the buffer overflows', () => {
    const buffer: BootstrapEventBuffer = makeBuffer({ maxBytes: 800 });
    buffer.addExternalOutput('stdout', 'x'.repeat(2000));

    expect(buffer.failed).toBe(true);
    expect(buffer.truncation.droppedRequired).toBeGreaterThan(0);
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
      buffer.emit({ type: 'sessionStarted', payload: { argv: ['build'] } });
      buffer.emit({ type: 'commandStarted', payload: { commandName: 'build' } });

      const { handoffPath: filePath, nonce } = await writeBootstrapHandoffFileAsync(buffer, {
        directory,
        pid: 4242
      });
      expect(filePath.startsWith(directory)).toBe(true);
      expect(filePath).toContain('4242');
      expect(path.basename(filePath)).toContain(nonce);
      expect(nonce).toHaveLength(36);

      const { header, events } = await readBootstrapHandoffFileAsync(filePath);
      expect(header?.kind).toBe('bootstrapHandoff');
      expect(header?.nonce).toBe(nonce);
      expect(events).toHaveLength(2);
      expect((events[0] as Record<string, unknown>).type).toBe('sessionStarted');
      expect((events[1] as Record<string, unknown>).type).toBe('commandStarted');
      if (process.platform !== 'win32') {
        expect((await fs.promises.stat(filePath)).mode % 0o1000).toBe(0o600);
      }

      await deleteBootstrapHandoffFileAsync(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
      // Deleting a missing file is a no-op.
      await deleteBootstrapHandoffFileAsync(filePath);
      // Cleanup failures are also best-effort.
      await deleteBootstrapHandoffFileAsync(directory);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves valid records before a malformed trailing record', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-boot-test-'));
    try {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      await fs.promises.appendFile(handoffPath, '{"truncated":');

      const { events, discardedRecordCount } = await readBootstrapHandoffFileAsync(handoffPath);
      expect(events).toHaveLength(1);
      expect(discardedRecordCount).toBe(1);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves valid records after a malformed middle record', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-boot-test-'));
    try {
      const buffer: BootstrapEventBuffer = makeBuffer();
      buffer.emit({ type: 'sessionStarted', payload: {} });
      buffer.emit({ type: 'commandStarted', payload: {} });
      const { handoffPath } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const lines: string[] = (await fs.promises.readFile(handoffPath, 'utf8')).trimEnd().split('\n');
      lines.splice(2, 0, '{"malformed":');
      await fs.promises.writeFile(handoffPath, `${lines.join('\n')}\n`);

      const { events, discardedRecordCount } = await readBootstrapHandoffFileAsync(handoffPath);
      expect(events).toHaveLength(2);
      expect(discardedRecordCount).toBe(1);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a handoff larger than the bounded bootstrap allowance', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-boot-test-'));
    try {
      const filePath: string = path.join(directory, 'oversized.ndjson');
      await fs.promises.writeFile(filePath, 'x'.repeat(1024 * 1024 + 2048));

      await expect(readBootstrapHandoffFileAsync(filePath)).rejects.toThrow(/exceeds/);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
