// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOrphanReap } from '@rushstack/rush-daemon-transport';

import { createOrphanReapNoticeHandler, formatOrphanReapNotice } from '../daemonReclaimNotice';

function reapOf(processGroupIds: number[], outcome: IDaemonOrphanReap['outcome']): IDaemonOrphanReap {
  return { daemonPid: 4242, processGroupIds, outcome };
}

describe(formatOrphanReapNotice.name, () => {
  it('names the exited daemon and the process group that was stopped', () => {
    expect(formatOrphanReapNotice(reapOf([4242], 'terminated'), false)).toBe(
      'rush-client: Stopped the operations that the exited daemon (PID 4242) left running (process group 4242).'
    );
    expect(formatOrphanReapNotice(reapOf([4242], 'terminated'), true)).toBe(
      'rushx-client: Stopped the operations that the exited daemon (PID 4242) left running (process group 4242).'
    );
  });

  it('says when the operations had to be killed', () => {
    expect(formatOrphanReapNotice(reapOf([501, 502], 'killed'), false)).toBe(
      'rush-client: Killed the operations that the exited daemon (PID 4242) left running ' +
        '(process groups 501 and 502); they did not exit after SIGTERM.'
    );
  });

  it('lists up to four process groups, then counts the others', () => {
    expect(formatOrphanReapNotice(reapOf([501, 502, 503], 'terminated'), false)).toContain(
      '(process groups 501, 502 and 503).'
    );
    expect(formatOrphanReapNotice(reapOf([501, 502, 503, 504], 'terminated'), false)).toContain(
      '(process groups 501, 502, 503 and 504).'
    );
    expect(formatOrphanReapNotice(reapOf([501, 502, 503, 504, 505], 'terminated'), false)).toContain(
      '(process groups 501, 502, 503, 504 and 1 more).'
    );
    expect(formatOrphanReapNotice(reapOf([501, 502, 503, 504, 505, 506], 'terminated'), false)).toContain(
      '(process groups 501, 502, 503, 504 and 2 more).'
    );
  });
});

describe(createOrphanReapNoticeHandler.name, () => {
  const line: string =
    'rush-client: Stopped the operations that the exited daemon (PID 4242) left running (process group 4242).';

  it('writes the line to stderr without an agent renderer', () => {
    const writes: string[] = [];
    const handler: (reap: IDaemonOrphanReap) => void = createOrphanReapNoticeHandler({
      rushx: false,
      agentRenderer: undefined,
      writeStderr: (text: string) => writes.push(text)
    });
    handler(reapOf([4242], 'terminated'));
    expect(writes).toEqual([`${line}\n`]);
  });

  it('gives the line to the agent renderer, and writes nothing to stderr', () => {
    const notes: string[] = [];
    const writes: string[] = [];
    const handler: (reap: IDaemonOrphanReap) => void = createOrphanReapNoticeHandler({
      rushx: false,
      agentRenderer: { note: (text: string) => notes.push(text) },
      writeStderr: (text: string) => writes.push(text)
    });
    handler(reapOf([4242], 'terminated'));
    expect(notes).toEqual([line]);
    expect(writes).toEqual([]);
  });
});
