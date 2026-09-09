// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { createPersistentIpcTestFixture, type IPersistentIpcTestFixture } from './PersistentIpcTestFixture';

jest.setTimeout(45_000);

describe('explicit persistent Node IPC through the public client', () => {
  let activeFixture: IPersistentIpcTestFixture | undefined;
  afterEach(async () => {
    const closing = activeFixture;
    activeFixture = undefined;
    await closing?.closeAsync();
  }, 35_000);

  function withFixtureAsync(
    work: (current: IPersistentIpcTestFixture) => Promise<void>,
    options: Parameters<typeof createPersistentIpcTestFixture>[0] = {}
  ): Promise<void> {
    const current = createPersistentIpcTestFixture(options);
    activeFixture = current;
    return current.runAsync(() => work(current));
  }

  it('runs the real Node launcher, preserves raw args, reuses PID and skips unchanged work', () => withFixtureAsync(async (fixture) => {
    const result = await fixture.invokeAsync(['build', '--only', 'a', '--label', 'custom raw value', '--ignored', 'excluded', '--verbose']);
    if (result.code !== 0) throw new Error(`IPC invocation failed: ${result.stderr}\n${result.stdout}`);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toMatch(/using in-process/i);
    expect(result.stdout).toContain('ipc-a-one-original');
    const ready = fixture.events().filter((event) => event.kind === 'ready');
    expect(ready).toHaveLength(1);
    expect(ready[0].args).toEqual(['literal space', '"quoted"', '%NOT_EXPANDED%', '--label', 'custom raw value']);
    const status = await fixture.statusAsync();
    expect(status.workspace?.warmSet?.measuredRunnerMemoryBytes).toBeGreaterThan(0);
    expect(status.workspace?.warmSet?.unmeasuredRunnerCount).toBe(0);
    const argv = ['build', '--only', 'a', '--label', 'custom raw value', '--ignored', 'excluded', '--verbose'];
    expect((await fixture.invokeAsync(argv)).code).toBe(0);
    expect(fixture.events().filter((event) => event.kind === 'complete')).toHaveLength(1);
    fixture.input('a', { value: 'two' });
    await delayAsync(100);
    expect(fixture.events().filter((event) => event.kind === 'complete')).toHaveLength(1);
    expect((await fixture.invokeAsync(argv)).code).toBe(0);
    const events = fixture.events();
    expect(events.filter((event) => event.kind === 'ready')).toHaveLength(1);
    expect(events.filter((event) => event.kind === 'complete').map((event) => event.pid)).toEqual([ready[0].pid, ready[0].pid]);
    expect((await fixture.statusAsync()).workspace?.generationToken).toBe(status.workspace?.generationToken);
    expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/result.txt'), 'utf8')).toBe('two:original');
  }));

  it('retires entrypoint and local tool implementation changes without restarting on ordinary input', () => withFixtureAsync(async (fixture) => {
    await fixture.buildAsync('--only', 'a');
    const first = await fixture.statusAsync();
    const oldPid = fixture.events().find((event) => event.kind === 'ready')!.pid;
    fixture.write('a/tools/ipc/implementation.cjs', "exports.version = 'changed';\n");
    await fixture.buildAsync('--only', 'a');
    const second = await fixture.statusAsync();
    expect(second.pid).toBe(first.pid);
    expect(second.workspace?.generationToken).not.toBe(first.workspace?.generationToken);
    expect(fixture.events().some((event) => event.kind === 'closed' && event.pid === oldPid)).toBe(true);
    expect(fixture.events().filter((event) => event.kind === 'ready').at(-1)?.pid).not.toBe(oldPid);
    expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/result.txt'), 'utf8')).toBe('one:changed');
    const nextPid = fixture.events().filter((event) => event.kind === 'ready').at(-1)!.pid;
    const entry = fs.readFileSync(path.join(fixture.folder, 'a/tools/ipc/entry.cjs'), 'utf8');
    fixture.write('a/tools/ipc/entry.cjs', `${entry}\n// Updated entrypoint implementation.\n`);
    await fixture.buildAsync('--only', 'a');
    expect(fixture.events().some((event) => event.kind === 'closed' && event.pid === nextPid)).toBe(true);
    expect(fixture.events().filter((event) => event.kind === 'ready').at(-1)?.pid).not.toBe(nextPid);
  }));

  it('leaves non-opted-in builds and rebuilds on the native shell path', () => withFixtureAsync(async (fixture) => {
    await fixture.buildAsync('--only', 'a');
    expect(fixture.events()).toEqual([]);
    expect(fs.readFileSync(path.join(fixture.folder, 'runs.txt'), 'utf8')).toContain('a:one');
    const config = JSON.parse(fs.readFileSync(path.join(fixture.folder, 'rush.json'), 'utf8'));
    config.daemon.usePersistentIpcRunners = true;
    fixture.write('rush.json', JSON.stringify(config));
    await fixture.buildAsync('--only', 'a');
    const oldPid = fixture.events().find((event) => event.kind === 'ready')!.pid;
    for (let index = 0; index < 2; index++) {
      const result = await fixture.invokeAsync(['rebuild', '--only', 'a', '--verbose']);
      expect(result.code).toBe(0);
      expect(result.stderr).not.toMatch(/using in-process/i);
    }
    expect(fixture.events().filter((event) => event.kind === 'ready')).toHaveLength(1);
    expect(fixture.events().some((event) => event.kind === 'closed' && event.pid === oldPid)).toBe(true);
    expect(fs.readFileSync(path.join(fixture.folder, 'runs.txt'), 'utf8').trim().split('\n')).toHaveLength(3);
  }, { enabled: false }));
});
