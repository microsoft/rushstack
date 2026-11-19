// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { WorkspaceInputChangeTier } from '@microsoft/rush-lib';
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
 * Composes its resolvers as the production host does, so it serves rushx scripts. c builds until the test removes
 * the `hold` marker. Project a's `hello` script records that it ran, and exits.
 */
function createHeldFixtureAsync(
  configure?: (fixture: DaemonGraphTestFixture) => void
): Promise<DaemonGraphTestFixture> {
  return DaemonGraphTestFixture.createAsync((created: DaemonGraphTestFixture) => {
    created.servesRushx = true;
    created.write('hold', '');
    created.write(
      'a/package.json',
      JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: {},
        scripts: { '_phase:compile': 'node build.cjs', hello: 'node hello.cjs' }
      })
    );
    created.write('a/hello.cjs', "require('node:fs').appendFileSync('../runs.txt','hello\\n');");
    created.write(
      'c/build.cjs',
      "const fs=require('node:fs');fs.appendFileSync('../runs.txt','c\\n');" +
        "const t=setInterval(()=>{if(!fs.existsSync('../hold'))clearInterval(t);},20);"
    );
    configure?.(created);
  });
}

async function waitForAsync(predicate: () => boolean): Promise<void> {
  const deadline: number = Date.now() + 30_000;
  while (!predicate() && Date.now() < deadline) await delayAsync(20);
}

function isQueuePosition(frame: IDaemonFrame): boolean {
  if (frame.kind !== DaemonFrameType.controlJson) return false;
  const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
  return message.kind === 'queuePosition';
}

async function readUntilQueuedAsync(client: DaemonRequestWireClient): Promise<void> {
  while (!isQueuePosition(await client.readFrameAsync()));
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

/** Runs a's `hello` script as rush-client sends it for `rushx hello`. */
function runHelloAsync(
  fixture: DaemonGraphTestFixture,
  admission: IDaemonRequestEnvelope['admission']
): Promise<ITerminalExchange> {
  return fixture.runAsync(['hello'], helloOverrides(fixture, admission));
}

function helloOverrides(
  fixture: DaemonGraphTestFixture,
  admission: IDaemonRequestEnvelope['admission']
): Partial<IDaemonRequestEnvelope> {
  return { commandOrigin: 'custom', invocationKind: 'rushx', cwd: path.join(fixture.folder, 'a'), admission };
}

interface IHeldTransition {
  /** The rebuild, which runs c until the test removes the `hold` marker. */
  readonly running: Promise<ITerminalExchange>;
  /** The request that owns the transition. It waits for the rebuild. */
  readonly owner: Promise<ITerminalExchange>;
  readonly client: DaemonRequestWireClient;
}

/**
 * Starts the rebuild, then `argv`, and returns once `argv` waits behind the rebuild. `change` runs after the rebuild
 * captured the workspace's inputs.
 */
async function holdTransitionAsync(
  fixture: DaemonGraphTestFixture,
  argv: string[],
  waitTimeoutMs: number,
  change?: () => void
): Promise<IHeldTransition> {
  const running: Promise<ITerminalExchange> = fixture.runAsync(['rebuild', '--to', 'c']);
  // A failed expectation leaves the rebuild and the owner unread until the test closes their connections.
  running.catch(() => undefined);
  await waitForAsync(() => fixture.runs().includes('c'));
  change?.();
  const client: DaemonRequestWireClient = await fixture.connectAsync();
  const envelope: IDaemonRequestEnvelope = fixture.envelope(argv, { admission: { waitTimeoutMs } });
  await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
  await readUntilQueuedAsync(client);
  const owner: Promise<ITerminalExchange> = client.readTerminalAsync(envelope.requestId);
  owner.catch(() => undefined);
  return { running, owner, client };
}

describe('a served rushx script while a transition waits for a running build', () => {
  it('starts at once, on the current generation, while a build waits to reload the graph', async () => {
    const fixture: DaemonGraphTestFixture = await createHeldFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    let transition: IHeldTransition | undefined;
    try {
      // The build reloads the graph, since the rebuild bound the engine, so it owns that transition while it waits.
      transition = await holdTransitionAsync(fixture, ['build', '--to', 'c'], 60_000);
      const { running, owner } = transition;
      const generation: number = fixture.host.workspaceGeneration;

      // A request that follows a transition is admitted one way with a wait timeout and another way without one.
      for (const admission of [{ waitTimeoutMs: 5_000 }, { noWait: true }]) {
        const { frames, terminal } = await runHelloAsync(fixture, admission);
        expect(terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        expect(frames.filter(isQueuePosition)).toEqual([]);
      }
      // Only scripts pass the build. A graph request that the current generation could answer at once, and a rebuild
      // that could reuse it, wait behind the build.
      for (const argv of [
        ['daemon', 'graph', 'status'],
        ['rebuild', '--to', 'c']
      ]) {
        expect((await fixture.runAsync(argv, { admission: { noWait: true } })).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, admissionErrorCode: 'no-wait' }
        });
      }
      // The rebuild and the build still wait for the marker.
      expect(fixture.runs()).toEqual(['c', 'hello', 'hello']);
      expect(fixture.host.workspaceGeneration).toBe(generation);
      expect(await isSettledAsync(running)).toBe(false);
      expect(await isSettledAsync(owner)).toBe(false);

      fs.rmSync(hold);
      expect((await running).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect((await owner).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
      expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
    } finally {
      fs.rmSync(hold, { force: true });
      await transition?.client.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('waits while the reload replaces the generation, and then starts on the new one', async () => {
    const fixture: DaemonGraphTestFixture = await createHeldFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    let transition: IHeldTransition | undefined;
    let script: DaemonRequestWireClient | undefined;
    let releaseReload: () => void = () => undefined;
    const reloadReleased: Promise<void> = new Promise((resolve) => (releaseReload = resolve));
    try {
      transition = await holdTransitionAsync(fixture, ['build', '--to', 'c'], 60_000);
      const { running, owner } = transition;
      const generation: number = fixture.host.workspaceGeneration;
      let reloading: boolean = false;
      fixture.beforeCreateSessionAsync = async () => {
        reloading = true;
        await reloadReleased;
      };
      fs.rmSync(hold);
      expect((await running).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      await waitForAsync(() => reloading);
      expect(reloading).toBe(true);

      // The build holds the gate while it replaces the generation, so the script waits for it.
      script = await fixture.connectAsync();
      const hello: IDaemonRequestEnvelope = fixture.envelope(
        ['hello'],
        helloOverrides(fixture, { waitTimeoutMs: 5_000 })
      );
      await script.sendControlAsync({ kind: 'requestStart', payload: hello });
      await readUntilQueuedAsync(script);
      await delayAsync(200);
      expect(fixture.runs()).not.toContain('hello');

      releaseReload();
      expect((await script.readTerminalAsync(hello.requestId)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect((await owner).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(fixture.runs()).toContain('hello');
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
    } finally {
      releaseReload();
      fs.rmSync(hold, { force: true });
      await script?.closeAsync();
      await transition?.client.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('still waits behind a native install that reloads the graph, since the script would end with this process', async () => {
    const fixture: DaemonGraphTestFixture = await createHeldFixtureAsync((created) => {
      // The install is never admitted, so no successor is launched.
      created.getSuccessorLaunchAsync = () => Promise.reject(new Error('No successor was expected.'));
    });
    const hold: string = path.join(fixture.folder, 'hold');
    let transition: IHeldTransition | undefined;
    try {
      // A changed project configuration gives the install the tier of a build's reload.
      transition = await holdTransitionAsync(fixture, ['install'], 3_000, () => {
        const packageJsonPath: string = path.join(fixture.folder, 'b/package.json');
        const packageJson: Record<string, unknown> = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        fs.writeFileSync(packageJsonPath, JSON.stringify({ ...packageJson, description: 'changed' }));
      });
      const { running, owner } = transition;

      const { frames, terminal } = await runHelloAsync(fixture, { waitTimeoutMs: 500 });
      expect(terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
      });
      expect(frames.filter(isQueuePosition)).not.toEqual([]);
      expect(fixture.runs()).toEqual(['c']);

      expect((await owner).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
      });
      fs.rmSync(hold);
      expect((await running).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(fixture.runs()).not.toContain('hello');
    } finally {
      fs.rmSync(hold, { force: true });
      await transition?.client.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });
});
