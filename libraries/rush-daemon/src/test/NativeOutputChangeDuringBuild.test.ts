// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { createNativeScriptGateAsync, type INativeScriptGate } from './NativeEngineTestCommands';
import { createFixtureAsync, runAsync, runs, type IFixture } from './NativeEngineTestFixture';

jest.setTimeout(30_000);

describe('native production daemon engine', () => {
  it.each<[string, (libPath: string) => void]>([
    ['adds an output file', (libPath) => fs.writeFileSync(path.join(libPath, 'race.txt'), 'race')],
    [
      'edits an output file in place',
      (libPath) => fs.writeFileSync(path.join(libPath, 'output.txt'), 'edited in place')
    ]
  ])(
    're-runs an operation after a change that %s once it ran, while its consumer still ran',
    async (description: string, change: (libPath: string) => void) => {
      const fixture: IFixture = await createFixtureAsync();
      const gate: INativeScriptGate = await createNativeScriptGateAsync(fixture.repoRoot, 'b');
      let initial: Promise<ITerminalExchange> | undefined;
      try {
        initial = runAsync(fixture, 'initial', ['build', '--to', 'b']);
        await Promise.race([
          gate.entered,
          initial.then((exchange: ITerminalExchange) => {
            throw new Error(`b did not enter its script gate: ${JSON.stringify(exchange.terminal)}`);
          })
        ]);
        // Rush reported the result of a before b started, so the result of a does not include this change.
        change(path.join(fixture.repoRoot, 'projects/a/lib'));
        await gate.releaseAsync();
        expect((await initial).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        expect(runs(fixture)).toEqual(['a:one:', 'b:one:']);

        expect((await runAsync(fixture, 'changed', ['build', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: true }
        });
        expect(runs(fixture).slice(2)).toEqual(['a:one:']);
        expect((await runAsync(fixture, 'unchanged', ['build', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: false }
        });
        expect(runs(fixture)).toHaveLength(3);
      } finally {
        await gate.releaseAsync();
        await initial?.catch(() => undefined);
        await fixture[Symbol.asyncDispose]();
      }
    }
  );
});
