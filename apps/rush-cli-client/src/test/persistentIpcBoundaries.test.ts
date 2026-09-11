// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createPersistentIpcTestFixture, type IPersistentIpcTestFixture } from './PersistentIpcTestFixture';

jest.setTimeout(60_000);

describe('production Node descriptor boundaries through the public client', () => {
  let activeFixture: IPersistentIpcTestFixture | undefined;
  afterEach(async () => {
    const closing = activeFixture;
    activeFixture = undefined;
    await closing?.closeAsync();
  }, 35_000);

  function withFixtureAsync(
    callback: (fixture: IPersistentIpcTestFixture) => Promise<void>,
    options: Parameters<typeof createPersistentIpcTestFixture>[0] = {}
  ): Promise<void> {
    const fixture = createPersistentIpcTestFixture(options);
    activeFixture = fixture;
    return fixture.runAsync(() => callback(fixture));
  }

  it.each(['direct', 'inherited', 'rig'] as const)('replaces a changed %s descriptor before reusing a child', (kind) =>
    withFixtureAsync(async (fixture) => {
      await fixture.buildAsync('--only', 'a');
      const before = await fixture.statusAsync();
      const previous = fixture.events().find((event) => event.kind === 'ready')!;
      const relative = kind === 'direct' ? 'a/config/rush-project.json' : kind === 'inherited'
        ? 'common/temp/shared-ipc.json'
        : 'a/node_modules/ipc-fixture-rig/profiles/default/config/rush-project.json';
      const config = JSON.parse(fs.readFileSync(path.join(fixture.folder, relative), 'utf8'));
      config.operationSettings[0].daemonIpc.args = ['changed descriptor', '"literal"'];
      fixture.write(relative, JSON.stringify(config));
      await fixture.buildAsync('--only', 'a');
      const after = await fixture.statusAsync();
      const next = fixture.events().filter((event) => event.kind === 'ready').at(-1)!;
      expect(after.pid).toBe(before.pid);
      expect(after.workspace?.generationToken).not.toBe(before.workspace?.generationToken);
      expect(next.pid).not.toBe(previous.pid);
      expect(next.args).toEqual(['changed descriptor', '"literal"']);
      expect(fixture.events().some((event) => event.kind === 'closed' && event.pid === previous.pid)).toBe(true);
    }, { configurationKind: kind })
  );

  it('preserves native NoOp, missing-script errors, and empty selection without starting a tool', () =>
    withFixtureAsync(async (fixture) => {
      const config = JSON.parse(fs.readFileSync(path.join(fixture.folder, 'a/package.json'), 'utf8'));
      config.scripts['_phase:compile'] = '';
      fixture.write('a/package.json', JSON.stringify(config));
      await fixture.buildAsync('--only', 'a');
      expect(fixture.events()).toEqual([]);
      const empty = await fixture.invokeAsync(['build', '--to-except', 'a', '--verbose']);
      expect(empty.code).toBe(0);
      expect(fixture.events()).toEqual([]);
      delete config.scripts['_phase:compile'];
      fixture.write('a/package.json', JSON.stringify(config));
      const missing = await fixture.invokeAsync(['build', '--only', 'a', '--verbose']);
      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain('does not define');
      expect(fixture.events()).toEqual([]);
    })
  );

  it('preserves preassigned native shard runners instead of applying the Node descriptor to them', () =>
    withFixtureAsync(async (fixture) => {
      const project = JSON.parse(fs.readFileSync(path.join(fixture.folder, 'a/package.json'), 'utf8'));
      project.scripts['_phase:compile:shard'] = 'node build.cjs';
      fixture.write('a/package.json', JSON.stringify(project));
      const config = JSON.parse(fs.readFileSync(path.join(fixture.folder, 'a/config/rush-project.json'), 'utf8'));
      config.operationSettings[0].sharding = { count: 2 };
      config.operationSettings.push({
        operationName: '_phase:compile:shard',
        daemonIpc: config.operationSettings[0].daemonIpc
      });
      fixture.write('a/config/rush-project.json', JSON.stringify(config));
      await fixture.buildAsync('--only', 'a');
      expect(fixture.events()).toEqual([]);
      expect(fs.readFileSync(path.join(fixture.folder, 'runs.txt'), 'utf8').trim().split('\n')).toHaveLength(3);
    })
  );

  it('honors native --no-ipc where registered without enabling graph watch mode', () =>
    withFixtureAsync(async (fixture) => {
      const commands = JSON.parse(fs.readFileSync(path.join(fixture.folder, 'common/config/rush/command-line.json'), 'utf8'));
      commands.commands[0].watchOptions = { alwaysWatch: false, watchPhases: ['_phase:compile', '_phase:empty'] };
      fixture.write('common/config/rush/command-line.json', JSON.stringify(commands));
      fixture.write('common/config/rush/experiments.json', '{"useIPCScriptsInWatchMode":true}');
      const result = await fixture.invokeAsync(['build', '--only', 'a', '--no-ipc', '--verbose']);
      if (result.code !== 0) throw new Error(`Native --no-ipc failed: ${result.stderr}\n${result.stdout}`);
      expect(result.code).toBe(0);
      expect(fixture.events()).toEqual([]);
      await fixture.buildAsync('--only', 'a');
      expect(fixture.events().filter((event) => event.kind === 'ready')).toHaveLength(1);
    })
  );

  it('preserves complete Unicode output and warning/failure results from the real retained tool', () =>
    withFixtureAsync(async (fixture) => {
      fixture.input('a', { value: 'output', outputBytes: 32_769, warning: true });
      const warning = await fixture.invokeAsync(['build', '--only', 'a', '--verbose']);
      expect(warning.code).toBe(1);
      const beginning = warning.stdout.indexOf('PAYLOAD_BEGIN:');
      const ending = warning.stdout.indexOf(':PAYLOAD_END', beginning);
      expect(beginning).toBeGreaterThanOrEqual(0);
      expect(ending).toBeGreaterThan(beginning);
      expect(warning.stdout.slice(beginning + 'PAYLOAD_BEGIN:'.length, ending)).toBe(String.fromCodePoint(0x1f642).repeat(32_769));
      expect(warning.stderr + warning.stdout).toContain('ipc-warning');
      fixture.input('a', { value: 'failure', failure: true });
      const failed = await fixture.invokeAsync(['build', '--only', 'a', '--verbose']);
      expect(failed.code).toBe(1);
      expect(fixture.events().filter((event) => event.kind === 'complete')).toHaveLength(2);
      expect(fixture.events().filter((event) => event.kind === 'ready')).toHaveLength(1);
    })
  );

  it('does not replay a launched descriptor that exits without IPC readiness', () =>
    withFixtureAsync(async (fixture) => {
      fixture.write('a/tools/ipc/entry.cjs', "require('node:fs').appendFileSync('../common/temp/no-ipc-runs', 'once\\n');\n");
      const result = await fixture.invokeAsync(['build', '--only', 'a', '--verbose']);
      expect(result.code).toBe(1);
      expect(result.stderr + result.stdout).toContain('without completing IPC readiness');
      expect(result.stderr).not.toContain('using in-process');
      expect(fs.readFileSync(path.join(fixture.folder, 'common/temp/no-ipc-runs'), 'utf8')).toBe('once\n');
      expect(fs.existsSync(path.join(fixture.folder, 'runs.txt'))).toBe(false);
    })
  );
});
