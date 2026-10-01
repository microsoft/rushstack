// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { OperationStatus } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type IDaemonFrame,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import type { DaemonRequestWireClient, ITerminalExchange } from './DaemonRequestWireTestUtilities';

jest.setTimeout(60_000);

/**
 * Composes its resolvers as the production host does. c builds until the test removes the `hold` marker. `test` is a
 * phased command of command-line.json, as in rushstack.
 */
function createHeldFixtureAsync(): Promise<DaemonGraphTestFixture> {
  return DaemonGraphTestFixture.createAsync((created: DaemonGraphTestFixture) => {
    created.servesRushx = true;
    created.write('hold', '');
    created.write(
      'common/config/rush/command-line.json',
      JSON.stringify({
        phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
        commands: ['build', 'test'].map((name: string) => ({
          commandKind: 'phased',
          name,
          summary: name,
          phases: ['_phase:compile'],
          incremental: true,
          enableParallelism: true
        }))
      })
    );
    created.write(
      'c/build.cjs',
      "const fs=require('node:fs');fs.appendFileSync('../runs.txt','c\\n');" +
        "const t=setInterval(()=>{if(!fs.existsSync('../hold'))clearInterval(t);},20);"
    );
  });
}

async function waitForRunAsync(fixture: DaemonGraphTestFixture, name: string): Promise<void> {
  const deadline: number = Date.now() + 30_000;
  while (!fixture.runs().includes(name) && Date.now() < deadline) await delayAsync(20);
}

function isQueuePosition(frame: IDaemonFrame): boolean {
  if (frame.kind !== DaemonFrameType.controlJson) return false;
  const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
  return message.kind === 'queuePosition';
}

async function readUntilQueuedAsync(client: DaemonRequestWireClient): Promise<void> {
  while (!isQueuePosition(await client.readFrameAsync()));
}

interface IHeldTransition {
  /** The rebuild, which runs c until the test removes the `hold` marker. */
  readonly running: Promise<ITerminalExchange>;
  /** The build after the rebuild. It reloads the graph, so it owns that transition while it waits for the rebuild. */
  readonly built: Promise<ITerminalExchange>;
  readonly patient: DaemonRequestWireClient;
}

async function holdTransitionAsync(fixture: DaemonGraphTestFixture): Promise<IHeldTransition> {
  const running: Promise<ITerminalExchange> = fixture.runAsync(['rebuild', '--to', 'c']);
  await waitForRunAsync(fixture, 'c');
  const patient: DaemonRequestWireClient = await fixture.connectAsync();
  const build: IDaemonRequestEnvelope = fixture.envelope(['build', '--to', 'c'], {
    admission: { waitTimeoutMs: 60_000 }
  });
  await patient.sendControlAsync({ kind: 'requestStart', payload: build });
  await readUntilQueuedAsync(patient);
  return { running, built: patient.readTerminalAsync(build.requestId), patient };
}

async function isSettledAsync(promise: Promise<unknown>): Promise<boolean> {
  let settled: boolean = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  await delayAsync(0);
  return settled;
}

describe('a command that the daemon never serves', () => {
  it('is rejected at once while a build waits behind the running build to reload the graph', async () => {
    const fixture: DaemonGraphTestFixture = await createHeldFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    let transition: IHeldTransition | undefined;
    try {
      transition = await holdTransitionAsync(fixture);
      const { running, built } = transition;

      // As rush-client sends them: it marks only build, rebuild, install and update as built-in commands. `list`
      // only reads the workspace; `install-autoinstaller` would stop the work that finished requests continue, and
      // there is none.
      const answers: ITerminalExchange[] = await Promise.all(
        [
          ['list', '--to', 'c'],
          ['install-autoinstaller', '--name', 'tools']
        ].map((argv: string[]) =>
          fixture.runAsync(argv, {
            commandOrigin: 'custom',
            admission: { waitTimeoutMs: 5_000 }
          })
        )
      );
      for (const { frames, terminal } of answers) {
        expect(terminal).toMatchObject({
          kind: 'requestRejected',
          payload: {
            code: 'unsupported',
            message: expect.stringContaining('is a built-in command that is not phased')
          }
        });
        expect(frames.filter(isQueuePosition)).toEqual([]);
      }
      // Neither waited for the rebuild or the build, and neither stopped the rebuild.
      expect(await isSettledAsync(running)).toBe(false);
      expect(await isSettledAsync(built)).toBe(false);
      expect(fixture.session.operationGraph?.status).toBe(OperationStatus.Executing);
      expect(fixture.runs()).toEqual(['c']);

      fs.rmSync(hold);
      expect((await running).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect((await built).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    } finally {
      fs.rmSync(hold, { force: true });
      await transition?.patient.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });
});

describe('a custom command', () => {
  it('waits for admission while a build waits behind the running build to reload the graph, and is served', async () => {
    const fixture: DaemonGraphTestFixture = await createHeldFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    let transition: IHeldTransition | undefined;
    try {
      transition = await holdTransitionAsync(fixture);
      const { running, built } = transition;

      // Only its parse, after admission, can tell whether the daemon serves a custom command.
      const tested: Promise<ITerminalExchange> = fixture.runAsync(['test', '--to', 'c'], {
        commandOrigin: 'custom',
        admission: { waitTimeoutMs: 60_000 }
      });
      await delayAsync(1_000);
      expect(await isSettledAsync(tested)).toBe(false);
      expect(await isSettledAsync(running)).toBe(false);
      expect(await isSettledAsync(built)).toBe(false);

      fs.rmSync(hold);
      expect((await running).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect((await built).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      const { frames, terminal } = await tested;
      expect(frames.filter(isQueuePosition)).not.toEqual([]);
      expect(terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    } finally {
      fs.rmSync(hold, { force: true });
      await transition?.patient.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });
});
