// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'node:os';

import {
  DAEMON_PROTOCOL_VERSION,
  RUSHD_OPERATION_STREAM_CLOSED,
  type DaemonEventType,
  type IDaemonEventEnvelope
} from '@rushstack/rush-daemon-protocol';

import { ClientOperationRenderer } from '../ClientOperationRenderer';

function event(type: DaemonEventType, payload: unknown): IDaemonEventEnvelope {
  return {
    eventId: 'event', sessionId: 'session', sequence: 1, timestamp: new Date().toISOString(),
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    source: { packageName: 'test', packageVersion: '1.0.0' },
    privacy: 'public', required: true, type, payload
  };
}

describe(ClientOperationRenderer.name, () => {
  it('renders operation chrome and global stderr activity without adding a second newline', async () => {
    const output: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };
    const renderer = new ClientOperationRenderer({
      requestId: 'request', colorLevel: 0, verbosity: 'normal',
      terminal: { columns: 80, isTTY: false },
      writeAsync: async (bytes, stream) => { output[stream] += Buffer.from(bytes).toString(); }
    });
    await renderer.initializeAsync();
    await renderer.writeEventAsync(event('operationRegistered', { operationId: 'project', silent: false }));
    await renderer.writeLogAsync(Buffer.from('built\n'), 'project', 'stdout');
    await renderer.writeEventAsync(event('extension', {
      name: RUSHD_OPERATION_STREAM_CLOSED, data: { operationId: 'project' }
    }));
    await renderer.writeEventAsync(event('activityChanged', { text: 'warning\n', stream: 'stderr' }));
    await renderer.closeAsync();
    expect(output.stdout).toContain('==[ project ]');
    expect(output.stdout).toContain(`built${EOL}`);
    expect(output.stderr).toBe(`warning${EOL}`);
  });

  it('preserves global command bytes without collation or text decoding', async () => {
    const output: Buffer[] = [];
    const renderer = new ClientOperationRenderer({
      requestId: 'request', colorLevel: 0, verbosity: 'normal',
      terminal: { columns: 80, isTTY: false },
      writeAsync: async (bytes) => { output.push(Buffer.from(bytes)); }
    });
    const bytes: Buffer = Buffer.from([0, 255, 3, 13]);
    await renderer.initializeAsync();
    await renderer.writeLogAsync(bytes, 'request', 'stdout');
    await renderer.closeAsync();
    expect(Buffer.concat(output)).toEqual(bytes);
  });

  it('propagates a backpressured output failure instead of reporting success', async () => {
    const failure: Error = new Error('output failed');
    const renderer = new ClientOperationRenderer({
      requestId: 'request', colorLevel: 0, verbosity: 'normal',
      terminal: { columns: 80, isTTY: false },
      writeAsync: async () => { throw failure; }
    });
    await renderer.initializeAsync();
    await expect(renderer.writeEventAsync(event('activityChanged', {
      text: 'activity', stream: 'stdout'
    }))).rejects.toBe(failure);
    await renderer.closeAsync();
  });
});
