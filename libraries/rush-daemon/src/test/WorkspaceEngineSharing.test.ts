// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IOperationGraph, ITelemetryData } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { readTelemetryEntries } from './NativeEngineTestFixture';

jest.setTimeout(60_000);

const custom: Partial<IDaemonRequestEnvelope> = { commandOrigin: 'custom' };

/**
 * build runs compile; test, retest and verify run compile and test. `--production` changes the compile commands, and
 * `--update-snapshots` the test commands.
 */
function configureCommands(fixture: DaemonGraphTestFixture): void {
  fixture.write(
    'common/config/rush/command-line.json',
    JSON.stringify({
      phases: [
        { name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } },
        { name: '_phase:test', dependencies: { self: ['_phase:compile'] } }
      ],
      commands: [
        {
          commandKind: 'phased',
          name: 'build',
          phases: ['_phase:compile'],
          incremental: true,
          enableParallelism: true
        },
        {
          commandKind: 'phased',
          name: 'test',
          summary: 'Builds and tests',
          phases: ['_phase:compile', '_phase:test'],
          incremental: true,
          enableParallelism: true
        },
        {
          commandKind: 'phased',
          name: 'retest',
          summary: 'Rebuilds and tests',
          phases: ['_phase:compile', '_phase:test'],
          incremental: false,
          enableParallelism: true
        },
        {
          commandKind: 'phased',
          name: 'verify',
          summary: 'Builds and tests, like test',
          phases: ['_phase:compile', '_phase:test'],
          incremental: true,
          enableParallelism: true
        }
      ],
      parameters: [
        {
          parameterKind: 'flag',
          longName: '--production',
          description: 'Production build',
          associatedCommands: ['build', 'test', 'retest', 'verify'],
          associatedPhases: ['_phase:compile']
        },
        {
          parameterKind: 'flag',
          longName: '--update-snapshots',
          description: 'Updates the snapshots of the tests',
          associatedCommands: ['test', 'retest'],
          associatedPhases: ['_phase:test']
        }
      ]
    })
  );
  for (const name of ['a', 'b', 'c']) {
    fixture.write(
      `${name}/package.json`,
      JSON.stringify({
        name,
        version: '1.0.0',
        dependencies: name === 'b' ? { a: '1.0.0' } : {},
        scripts: { '_phase:compile': 'node build.cjs', '_phase:test': 'node test.cjs' }
      })
    );
    fixture.write(
      `${name}/test.cjs`,
      `require('node:fs').appendFileSync('../runs.txt', 'test-${name}\\n');\n`
    );
  }
}

function expectSuccess(exchange: ITerminalExchange, scheduled?: boolean): void {
  expect(exchange.terminal).toMatchObject({
    kind: 'requestResult',
    payload: { exitCode: 0, ...(scheduled === undefined ? {} : { scheduled }) }
  });
}

function expectUnsupported(exchange: ITerminalExchange, message: string): void {
  expect(exchange.terminal).toMatchObject({
    kind: 'requestRejected',
    payload: { code: 'unsupported', message: expect.stringContaining(message) }
  });
}

function enableTelemetry(fixture: DaemonGraphTestFixture): void {
  const rushJson: object = JSON.parse(fs.readFileSync(path.join(fixture.folder, 'rush.json'), 'utf8'));
  fixture.write('rush.json', JSON.stringify({ ...rushJson, telemetryEnabled: true }));
}

async function withFixtureAsync(
  testAsync: (fixture: DaemonGraphTestFixture) => Promise<void>,
  configure?: (fixture: DaemonGraphTestFixture) => void
): Promise<void> {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync(
    (created: DaemonGraphTestFixture) => {
      configureCommands(created);
      configure?.(created);
    }
  );
  try {
    await testAsync(fixture);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
}

describe('engine sharing between phased commands', () => {
  it('switches to the engine of test once, and then serves build, retest and rebuild on it', () =>
    withFixtureAsync(async (fixture) => {
      expectSuccess(await fixture.runAsync(['build', '--to', 'b']));
      const buildGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      const buildGeneration: number = fixture.host.workspaceGeneration;

      // The engine of build has no test operations, but an engine created by test can serve build.
      expectSuccess(await fixture.runAsync(['test', '--only', 'a'], custom), true);
      const testGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      const testGeneration: number = fixture.host.workspaceGeneration;
      expect(testGraph).not.toBe(buildGraph);
      expect(testGeneration).toBeGreaterThan(buildGeneration);
      expect(fixture.runs()).toEqual(['a', 'b', 'test-a']);

      expectSuccess(await fixture.runAsync(['build', '--to', 'b']));
      expectSuccess(await fixture.runAsync(['retest', '--only', 'a'], custom), true);
      expectSuccess(await fixture.runAsync(['rebuild', '--only', 'c']), true);
      expectSuccess(await fixture.runAsync(['test', '--only', 'a'], custom), false);
      expect(fixture.session.operationGraph).toBe(testGraph);
      expect(fixture.host.workspaceGeneration).toBe(testGeneration);
      expect(fixture.runs()).toEqual(['a', 'b', 'test-a', 'a', 'test-a', 'c']);
    }));

  it('runs every selected operation of rebuild on the engine of build, and reloads an engine of rebuild for build', () =>
    withFixtureAsync(async (fixture) => {
      expectSuccess(await fixture.runAsync(['rebuild', '--to', 'b']), true);
      const rebuildGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      const rebuildGeneration: number = fixture.host.workspaceGeneration;

      // An engine created by a command that is not incremental serves only that command.
      expectSuccess(await fixture.runAsync(['build', '--to', 'b']));
      const buildGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect(buildGraph).not.toBe(rebuildGraph);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(rebuildGeneration);
      const buildGeneration: number = fixture.host.workspaceGeneration;

      const rebuild: ITerminalExchange = await fixture.runAsync(['rebuild', '--only', 'a']);
      expect(rebuild.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'a (compile)', status: 'SUCCESS' }] }
      });
      // Without a build cache, LegacySkipPlugin deletes the package-deps file of every operation of an iteration
      // that allows no skipping, disabled ones included. But the engine retained b's result, which LegacySkipPlugin
      // found up to date, and a ran again with the same state hash, so b stays verified and does not run. Rush
      // in-process does not run it either: the graph of its `rebuild --only a` has no b.
      expectSuccess(await fixture.runAsync(['build', '--to', 'b']));
      expect(fixture.session.operationGraph).toBe(buildGraph);
      expect(fixture.host.workspaceGeneration).toBe(buildGeneration);
      expect(fixture.runs()).toEqual(['a', 'b', 'a']);
    }));

  it('rejects a custom command when neither its engine nor the current one could serve the other', () =>
    withFixtureAsync(async (fixture) => {
      expectSuccess(await fixture.runAsync(['build', '--to', 'b']));
      const buildGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      const buildGeneration: number = fixture.host.workspaceGeneration;

      expectUnsupported(
        await fixture.runAsync(['retest', '--only', 'a'], custom),
        `The daemon's engine, created by "build", cannot serve "retest" because the graph of "build" does not ` +
          `have every operation of the "_phase:test" phase, and an engine created by "retest" could not serve ` +
          `"build" because "retest" is not incremental.`
      );
      expectUnsupported(
        await fixture.runAsync(['test', '--only', 'a', '--production'], custom),
        'could not serve "build" because the parameters of their phases differ ' +
          '(only "test" sets --production for "_phase:compile").'
      );
      expect(fixture.session.operationGraph).toBe(buildGraph);
      expect(fixture.host.workspaceGeneration).toBe(buildGeneration);
      expect(fixture.runs()).toEqual(['a', 'b']);

      expectSuccess(await fixture.runAsync(['test', '--only', 'a'], custom), true);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(buildGeneration);
      expect(fixture.runs()).toEqual(['a', 'b', 'test-a']);
    }));

  /**
   * Runs the custom command `first` and then `second`, which neither's engine can serve, and expects `message` for
   * `second` without a reload.
   */
  async function expectUnsupportedWithoutReloadAsync(
    first: string[],
    second: string[],
    message: string
  ): Promise<void> {
    await withFixtureAsync(async (fixture) => {
      expectSuccess(await fixture.runAsync([...first, '--only', 'a'], custom), true);
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      const generation: number = fixture.host.workspaceGeneration;

      expectUnsupported(await fixture.runAsync([...second, '--only', 'a'], custom), message);
      expect(fixture.session.operationGraph).toBe(graph);
      expect(fixture.host.workspaceGeneration).toBe(generation);
      expect(fixture.runs()).toEqual(['a', 'test-a']);
    });
  }

  /** The reason why neither of two requests of test could serve the other, if only `setter` sets a parameter. */
  function getSameCommandMessage(setter: string): string {
    return (
      `The daemon's engine, created by an earlier "test", cannot serve this "test", and an engine created by ` +
      `this "test" could not serve the earlier one either, because the parameters of their phases differ ` +
      `(only ${setter} sets --update-snapshots for "_phase:test").`
    );
  }

  it('names the earlier request of a custom command that sets a parameter that this request does not', () =>
    expectUnsupportedWithoutReloadAsync(
      ['test', '--update-snapshots'],
      ['test'],
      getSameCommandMessage('the earlier "test"')
    ));

  it('names this request of a custom command when it sets a parameter that the earlier request did not', () =>
    expectUnsupportedWithoutReloadAsync(
      ['test'],
      ['test', '--update-snapshots'],
      getSameCommandMessage('this "test"')
    ));

  it('gives the reason once when neither of two custom commands could serve the other for the same reason', () =>
    expectUnsupportedWithoutReloadAsync(
      ['test', '--production'],
      ['verify'],
      `The daemon's engine, created by "test", cannot serve "verify", and an engine created by "verify" could ` +
        `not serve "test" either, because the parameters of their phases differ ` +
        `(only "test" sets --production for "_phase:compile").`
    ));

  it('shares no engine between commands while a plugin taps runAnyPhasedCommand', () =>
    withFixtureAsync(async (fixture) => {
      expectSuccess(await fixture.runAsync(['build', '--to', 'b']));
      const buildGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      const buildGeneration: number = fixture.host.workspaceGeneration;
      fixture.session.rushSession!.hooks.runAnyPhasedCommand.tap('WorkspaceEngineSharing.test', () => {});

      expectUnsupported(
        await fixture.runAsync(['test', '--only', 'a'], custom),
        'could not serve "build" because a plugin taps the runAnyPhasedCommand hook'
      );
      expect(fixture.session.operationGraph).toBe(buildGraph);

      // The same command still shares the engine.
      expectSuccess(await fixture.runAsync(['build', '--to', 'b', '--ignore-hooks']), false);
      expect(fixture.session.operationGraph).toBe(buildGraph);

      // Built-in commands reload, as they did before engines were shared.
      expectSuccess(await fixture.runAsync(['rebuild', '--only', 'a']), true);
      expect(fixture.session.operationGraph).not.toBe(buildGraph);
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(buildGeneration);
      expect(fixture.runs()).toEqual(['a', 'b', 'a']);
    }));

  it('selects the phase dependencies of each request on a shared engine', () =>
    withFixtureAsync(async (fixture) => {
      expectSuccess(await fixture.runAsync(['test', '--only', 'b'], custom), true);
      const testGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect(fixture.runs()).toEqual(['b', 'test-b']);

      // b was built without a, so it runs again once a has run.

      const withDependencies: ITerminalExchange = await fixture.runAsync(
        ['test', '--only', 'b', '--include-phase-deps'],
        custom
      );
      expect(withDependencies.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 0,
          operationResults: expect.arrayContaining([{ operationId: 'a (compile)', status: 'SUCCESS' }])
        }
      });
      expectSuccess(await fixture.runAsync(['build', '--only', 'b', '--ignore-hooks']), false);
      expect(fixture.session.operationGraph).toBe(testGraph);
      expect(fixture.runs()).toEqual(['b', 'test-b', 'a', 'b', 'test-b']);
    }));

  it("logs the telemetry entry of each request that a shared engine serves under the request's own command", () =>
    withFixtureAsync(async (fixture) => {
      expectSuccess(await fixture.runAsync(['test', '--only', 'a'], custom), true);
      const testGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expectSuccess(await fixture.runAsync(['build', '--to', 'b']), true);
      expectSuccess(await fixture.runAsync(['retest', '--only', 'a'], custom), true);
      expectSuccess(await fixture.runAsync(['rebuild', '--only', 'c']), true);
      expect(fixture.session.operationGraph).toBe(testGraph);
      expect(fixture.runs()).toEqual(['a', 'test-a', 'b', 'a', 'test-a', 'c']);

      const entries: ITelemetryData[] = readTelemetryEntries(fixture.folder);
      expect(
        entries.map(({ name, result, extraData, operationResults }) => [
          name,
          result,
          extraData?.requestIndex,
          Object.keys(operationResults ?? {}).sort()
        ])
      ).toEqual([
        ['test', 'Succeeded', 1, ['a (compile)', 'a (test)']],
        ['build', 'Succeeded', 2, ['a (compile)', 'b (compile)']],
        ['retest', 'Succeeded', 3, ['a (compile)', 'a (test)']],
        ['rebuild', 'Succeeded', 4, ['c (compile)']]
      ]);
      expect(entries[1].extraData).toMatchObject({ command_to: 'true', '--to': 'b', countSkipped: 1 });
      expect(entries[2].extraData).toMatchObject({ command_only: 'true', '--only': 'a', countSuccess: 2 });
    }, enableTelemetry));
});
