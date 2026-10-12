// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IOperationGraph } from '@microsoft/rush-lib';
import type { IDaemonPhasedRequestResult } from '@rushstack/rush-daemon-protocol';

import { OperationOutputFingerprints } from '../OperationOutputFingerprints';
import { createFixtureAsync, runAsync, runs, type IFixture } from './NativeEngineTestFixture';

jest.setTimeout(60_000);

async function buildToBAsync(fixture: IFixture, requestId: string): Promise<IDaemonPhasedRequestResult> {
  const { terminal } = await runAsync(fixture, requestId, ['build', '--to', 'b']);
  expect(terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
  return (terminal as { payload: IDaemonPhasedRequestResult }).payload;
}

describe(OperationOutputFingerprints.name, () => {
  const canRevokeReadAccess: boolean = process.platform !== 'win32' && process.getuid?.() !== 0;
  (canRevokeReadAccess ? it : it.skip)(
    're-runs a warm operation on every request while its declared outputs cannot be read',
    async () => {
      const fixture: IFixture = await createFixtureAsync();
      const libPath: string = path.join(fixture.repoRoot, 'projects/a/lib');
      const unreadablePath: string = path.join(libPath, 'unreadable');
      try {
        await buildToBAsync(fixture, 'initial');
        expect(runs(fixture)).toEqual(['a:one:', 'b:one:']);
        const graph: IOperationGraph | undefined = fixture.session.operationGraph;

        // Adding the folder changes the output folder, so the reconciliation re-runs a.
        fs.mkdirSync(unreadablePath);
        fs.chmodSync(unreadablePath, 0);
        expect(await buildToBAsync(fixture, 'added')).toMatchObject({ scheduled: true });
        expect(runs(fixture).slice(2)).toEqual(['a:one:']);

        // The output folder is unchanged from here on, so only the content check re-runs a.
        const { ino, mtimeMs } = fs.statSync(libPath);
        expect(await buildToBAsync(fixture, 'unreadable')).toMatchObject({ scheduled: true });
        expect(runs(fixture).slice(3)).toEqual(['a:one:']);
        fs.chmodSync(unreadablePath, 0o755);
        expect(await buildToBAsync(fixture, 'readable')).toMatchObject({ scheduled: true });
        expect(runs(fixture).slice(4)).toEqual(['a:one:']);
        expect(fs.statSync(libPath)).toMatchObject({ ino, mtimeMs });

        expect(await buildToBAsync(fixture, 'unchanged')).toMatchObject({ scheduled: false });
        expect(runs(fixture)).toHaveLength(5);
        expect(fixture.session.operationGraph).toBe(graph);
      } finally {
        if (fs.existsSync(unreadablePath)) fs.chmodSync(unreadablePath, 0o755);
        await fixture[Symbol.asyncDispose]();
      }
    }
  );
});
