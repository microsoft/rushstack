// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const operationId: string = '@rushstack/rush-reporter#_phase:build';
const rawEvent = {
  sequence: 1,
  type: 'externalOutput',
  scope: { operationId },
  payload: { stream: 'stdout', text: '---- build started ----\n' }
};
const childEvent = {
  ...rawEvent,
  parentSessionId: 'parent',
  parentRequestId: 'request',
  parentOperationId: operationId,
  sourceSequence: 1,
  source: { packageName: '@rushstack/heft' }
};

function validate(events: readonly unknown[], platform: NodeJS.Platform): SpawnSyncReturns<string> {
  const moduleUrl: string = pathToFileURL(
    path.resolve(__dirname, '../../src/test/sandbox/reporter-demo/validateHeftOutput.mjs')
  ).href;
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { readFileSync } from 'node:fs';
       const { validateHeftOutput } = await import(process.argv[1]);
       const input = JSON.parse(readFileSync(0, 'utf8'));
       validateHeftOutput(input.events, input.platform);`,
      moduleUrl
    ],
    { input: JSON.stringify({ events, platform }), encoding: 'utf8', timeout: 5000 }
  );
}

describe('reporter demo Heft expectations', () => {
  it('accepts the intentional Windows raw fallback and the negotiated Unix path', () => {
    expect(validate([rawEvent], 'win32').status).toBe(0);
    expect(validate([childEvent], 'linux').status).toBe(0);
    expect(validate([childEvent], 'darwin').status).toBe(0);
  });

  it('does not weaken the supported Unix negotiation requirement', () => {
    const result: SpawnSyncReturns<string> = validate([rawEvent], 'linux');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not negotiate structured reporting');
  });

  it('requires readable Windows fallback without raw protocol records', () => {
    expect(validate([], 'win32').status).toBe(1);
    expect(validate([childEvent], 'win32').status).toBe(1);
    expect(
      validate(
        [{ ...rawEvent, payload: { stream: 'stdout', text: '---- build started ----\n{"kind":"hello"}\n' } }],
        'win32'
      ).status
    ).toBe(1);
  });

  it.each(['win32', 'linux'] as const)('rejects reordered or oversized %s output', (platform) => {
    const event = platform === 'win32' ? rawEvent : childEvent;
    expect(validate([event, event], platform).status).toBe(1);
    expect(
      validate(
        [{ ...event, payload: { stream: 'stdout', text: 'x'.repeat(64 * 1024 + 1) } }],
        platform
      ).status
    ).toBe(1);
  });
});
