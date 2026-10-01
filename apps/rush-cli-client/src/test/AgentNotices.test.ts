// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DAEMON_PROTOCOL_VERSION,
  type IDaemonActivityPayload,
  type IDaemonEventEnvelope
} from '@rushstack/rush-daemon-protocol';

import { AgentNotices } from '../AgentNotices';
import { AgentProgressRenderer } from '../AgentProgressRenderer';

const UNMATCHED_PLUGIN_WARNING: string =
  "Warning: the daemon's compatible plugin list names plugins that are not configured in rush-plugins.json: typo-plugin\n";
const CACHE_WARNING: string =
  'The Rush daemon never signs in interactively, so this build continues without signing in to the cloud build cache.\n';

function activity(payload: IDaemonActivityPayload, operationId?: string): IDaemonEventEnvelope {
  return {
    eventId: 'event',
    sessionId: 'session',
    sequence: 1,
    timestamp: new Date().toISOString(),
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    source: { packageName: 'test', packageVersion: '1.0.0' },
    privacy: 'public',
    required: true,
    type: 'activityChanged',
    scope: operationId === undefined ? undefined : { operationId },
    payload
  };
}

function createRenderer(isTTY: boolean): { renderer: AgentProgressRenderer; output: string[] } {
  const output: string[] = [];
  const renderer: AgentProgressRenderer = new AgentProgressRenderer({
    commandName: 'build',
    isTTY,
    columns: 60,
    write: (text: string) => output.push(text),
    now: () => 0,
    startTimeMs: 0
  });
  return { renderer, output };
}

describe(AgentNotices.name, () => {
  it('keeps the distinct lines of warnings and errors outside any operation', () => {
    const notices: AgentNotices = new AgentNotices();
    notices.add({ severity: 'warning', stream: 'stderr', text: UNMATCHED_PLUGIN_WARNING }, undefined);
    notices.add({ severity: 'warning', stream: 'stderr', text: UNMATCHED_PLUGIN_WARNING }, undefined);
    notices.add({ severity: 'error', stream: 'stderr', text: '\nFirst line\n  second line  \n' }, undefined);
    notices.add({ stream: 'stderr', text: 'Operations failed.\n' }, undefined);
    notices.add({ stream: 'stdout', text: 'FSTrace: Enabled\n' }, undefined);
    notices.add({ severity: 'warning', stream: 'stderr', text: 'operation warning\n' }, 'a (build)');
    expect(notices.getLines()).toEqual([UNMATCHED_PLUGIN_WARNING.trim(), 'First line', 'second line']);
  });

  it('prints at most three lines, each cut to 300 characters, and counts the rest', () => {
    const notices: AgentNotices = new AgentNotices();
    notices.add({ severity: 'warning', text: `${'x'.repeat(400)}\nb\nc\nd\ne\n` }, undefined);
    const lines: string[] = notices.getLines();
    expect(lines).toEqual([
      `${'x'.repeat(299)}…`,
      'b',
      'c',
      '+2 more warning and error lines; RUSHD_OUTPUT=legacy prints them all'
    ]);
  });
});

describe(`${AgentProgressRenderer.name} notices`, () => {
  it.each([false, true])('prints plugin warnings before the summary line (isTTY: %s)', (isTTY: boolean) => {
    const { renderer, output } = createRenderer(isTTY);
    renderer.start();
    renderer.onEvent(activity({ severity: 'warning', stream: 'stderr', text: UNMATCHED_PLUGIN_WARNING }));
    renderer.onEvent(activity({ severity: 'warning', stream: 'stderr', text: CACHE_WARNING }));
    renderer.onEvent(activity({ stream: 'stdout', text: 'rush build (0.50 seconds)\n' }));
    const beforeFinish: number = output.length;
    renderer.finish({ exitCode: 0 });
    expect(output.slice(beforeFinish).filter((text: string) => !text.startsWith('\x1b'))).toEqual([
      UNMATCHED_PLUGIN_WARNING,
      CACHE_WARNING,
      'rush build: SUCCESS up to date (no operations needed) in 0.0s\n'
    ]);
  });

  it('prints nothing more when no warning or error was written', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(activity({ stream: 'stderr', text: 'Operations succeeded with warnings.\n' }));
    const beforeFinish: number = output.length;
    renderer.finish({ exitCode: 0 });
    expect(output.slice(beforeFinish)).toEqual([
      'rush build: SUCCESS up to date (no operations needed) in 0.0s\n'
    ]);
  });
});
