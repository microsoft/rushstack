// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DAEMON_PROTOCOL_VERSION,
  type DaemonEventType,
  type IDaemonEventEnvelope
} from '@rushstack/rush-daemon-protocol';

import { AgentProgressRenderer } from '../AgentProgressRenderer';

function event(type: DaemonEventType, payload: unknown): IDaemonEventEnvelope {
  return {
    eventId: 'event',
    sessionId: 'session',
    sequence: 1,
    timestamp: new Date().toISOString(),
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    source: { packageName: 'test', packageVersion: '1.0.0' },
    privacy: 'public',
    required: false,
    type,
    payload
  };
}

const ANSI_ESCAPE: RegExp = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

function createRenderer(isTTY: boolean): { renderer: AgentProgressRenderer; output: string[]; clock: { ms: number } } {
  const output: string[] = [];
  const clock: { ms: number } = { ms: 0 };
  const renderer: AgentProgressRenderer = new AgentProgressRenderer({
    commandName: 'build',
    isTTY,
    columns: 60,
    write: (text: string) => output.push(text),
    now: () => clock.ms,
    startTimeMs: 0
  });
  return { renderer, output, clock };
}

function status(operationId: string, value: string): IDaemonEventEnvelope {
  return event('operationStatusChanged', { operationId, previousStatus: 'READY', status: value });
}

describe(AgentProgressRenderer.name, () => {
  it('writes a first line immediately and a bounded summary for a successful build (pipe)', () => {
    const { renderer, output, clock } = createRenderer(false);
    renderer.start();
    expect(output).toEqual(['rush build · 0.0s · connecting to rushd (auto-starts if needed)\n']);
    renderer.onEvent(event('operationRegistered', { operationId: 'a (build)', silent: false }));
    renderer.onEvent(event('operationRegistered', { operationId: 'b (build)', silent: false }));
    renderer.onEvent(event('operationRegistered', { operationId: 'hidden', silent: true }));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('noise\n'), 'a (build)', 'stdout');
    clock.ms = 2500;
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.onEvent(status('b (build)', 'SKIPPED'));
    clock.ms = 3000;
    renderer.finish({ exitCode: 0 });
    renderer.dispose();
    expect(output.join('')).not.toContain('noise');
    expect(output[output.length - 1]).toBe(
      'rush build: SUCCESS 2/2 operations (1 success, 1 skipped) in 3.0s\n'
    );
    expect(output.length).toBeLessThanOrEqual(4);
  });

  it('reports an up-to-date request instead of printing nothing', () => {
    const { renderer, output } = createRenderer(false);
    renderer.finish({ exitCode: 0 });
    expect(output).toEqual(['rush build: SUCCESS up to date (no operations needed) in 0.0s\n']);
  });

  it('lists failed operations and a bounded stderr tail on failure', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(status('p05 (build)', 'EXECUTING'));
    for (let i = 0; i < 20; i++) {
      renderer.onLog(Buffer.from(`error ${i}\n`), 'p05 (build)', 'stderr');
    }
    renderer.onEvent(status('p05 (build)', 'FAILURE'));
    renderer.onEvent(status('p06 (build)', 'BLOCKED'));
    renderer.finish({ exitCode: 1 });
    const text: string = output.join('');
    expect(text).toContain('rush build: FAILURE 2/2 operations (1 failure, 1 blocked) in 0.0s · failed: p05 (build)\n');
    expect(text).toContain('  p05 (build): error 10\n');
    expect(text).toContain('  p05 (build): error 19\n');
    expect(text).not.toContain('error 9\n');
  });

  it('keeps failure diagnostics when successful operations wrote stderr first', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(status('noisy (build)', 'EXECUTING'));
    for (let i = 0; i < 20; i++) {
      renderer.onLog(Buffer.from(`warning ${i}\n`), 'noisy (build)', 'stderr');
    }
    renderer.onEvent(status('noisy (build)', 'SUCCESS WITH WARNINGS'));
    renderer.onEvent(status('broken (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('the real error\n'), 'broken (build)', 'stderr');
    renderer.onEvent(status('broken (build)', 'FAILURE'));
    renderer.finish({ exitCode: 1 });
    const text: string = output.join('');
    expect(text).toContain('  broken (build): the real error\n');
    expect(text).not.toContain('noisy (build): warning');
  });

  it('counts ABORTED operations as finished', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(event('operationRegistered', { operationId: 'a (build)', silent: false }));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onEvent(status('a (build)', 'ABORTED'));
    renderer.finish({ exitCode: 1 });
    expect(output[output.length - 1]).toBe('rush build: FAILURE 1/1 operations (1 aborted) in 0.0s\n');
  });

  it('writes the final line at most once and nothing after it', () => {
    const { renderer, output } = createRenderer(false);
    renderer.finish({ exitCode: 1, errorMessage: 'daemon rejected the request (x)' });
    renderer.finish({ exitCode: 1, errorMessage: 'again' });
    renderer.onQueuePosition(3);
    renderer.dispose();
    expect(output).toEqual(['rush build: FAILURE 0/0 operations in 0.0s · daemon rejected the request (x)\n']);
  });

  it('does not repeat an unchanged queue position', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onQueuePosition(2);
    renderer.onQueuePosition(2);
    renderer.onQueuePosition(2);
    expect(output).toHaveLength(1);
    renderer.onQueuePosition(1);
    expect(output).toHaveLength(2);
    renderer.dispose();
  });

  it('shows the stdout tail of a failed operation that reported errors on stdout', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(status('ok (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('ok noise\n'), 'ok (build)', 'stdout');
    renderer.onEvent(status('ok (build)', 'SUCCESS'));
    renderer.onEvent(status('tsc (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('src/x.ts(1,1): error TS1005: stdout-error\n'), 'tsc (build)', 'stdout');
    renderer.onEvent(status('tsc (build)', 'FAILURE'));
    renderer.finish({ exitCode: 1 });
    const text: string = output.join('');
    expect(text).toContain('  tsc (build): src/x.ts(1,1): error TS1005: stdout-error\n');
    expect(text).not.toContain('ok noise');
  });

  it('shows queue position immediately', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onQueuePosition(2);
    expect(output[0]).toContain('queued behind another request (position 2)');
  });

  it('writes a final summary line after a queued request completes', () => {
    const { renderer, output, clock } = createRenderer(false);
    renderer.start();
    renderer.onQueuePosition(1);
    clock.ms = 4000;
    renderer.finish({ exitCode: 0 });
    expect(output[output.length - 1]).toBe('rush build: SUCCESS up to date (no operations needed) in 4.0s\n');
  });

  it('throttles progress lines on a pipe', () => {
    const { renderer, output, clock } = createRenderer(false);
    renderer.start();
    for (let i = 0; i < 50; i++) {
      clock.ms = i * 10;
      renderer.onEvent(status(`p${i} (build)`, 'EXECUTING'));
    }
    expect(output).toHaveLength(1);
    clock.ms = 2500;
    renderer.onEvent(status('p0 (build)', 'SUCCESS'));
    expect(output).toHaveLength(2);
    clock.ms = 3000;
    renderer.onEvent(status('p1 (build)', 'SUCCESS'));
    expect(output).toHaveLength(2);
    renderer.dispose();
  });

  it('renders at most three live rows on a TTY and clears them before the summary', () => {
    const { renderer, output } = createRenderer(true);
    renderer.start();
    renderer.onEvent(status('a-very-long-project-name-that-will-not-fit (build)', 'EXECUTING'));
    renderer.finish({ exitCode: 0 });
    const frames: string[] = output.slice(0, -2);
    for (const frame of frames) {
      const rows: string[] = frame.replace(ANSI_ESCAPE, '').split('\n');
      expect(rows.length).toBe(4); // three rows plus the trailing newline
      for (const row of rows) {
        expect(row.length).toBeLessThanOrEqual(59);
      }
    }
    expect(output[output.length - 2]).toBe('\x1b[3A\x1b[0J\x1b[?25h');
    expect(output[output.length - 1]).toContain('rush build: SUCCESS');
  });
});
