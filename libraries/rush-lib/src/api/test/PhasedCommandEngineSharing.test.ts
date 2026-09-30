// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NoOpTerminalProvider } from '@rushstack/terminal';

import { PhasedCommandEngine, type IPhasedCommandEngineSharingLabels } from '../PhasedCommandEngine';
import { RushConfiguration } from '../RushConfiguration';
import { Rush } from '../Rush';
import { RushSession } from '../../pluginFramework/RushSession';

describe(`${PhasedCommandEngine.name} engine sharing`, () => {
  let folder: string;
  let rushConfiguration: RushConfiguration;

  function write(name: string, value: unknown): void {
    const filename: string = path.join(folder, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(value));
  }

  async function parseAsync(
    argv: string[],
    configuration: RushConfiguration = rushConfiguration
  ): Promise<PhasedCommandEngine> {
    return await PhasedCommandEngine.parseAsync({
      argv,
      cwd: folder,
      environment: {},
      rushConfiguration: configuration,
      terminalProvider: new NoOpTerminalProvider()
    });
  }

  function createRushSession(): RushSession {
    return new RushSession({ terminalProvider: new NoOpTerminalProvider(), getIsDebugMode: () => false });
  }

  /** Why an engine created by `engineArgv` cannot serve `requestArgv`, or undefined if it can. */
  async function getBlockerAsync(
    engineArgv: string[],
    requestArgv: string[],
    rushSession: RushSession = createRushSession(),
    configuration: RushConfiguration = rushConfiguration
  ): Promise<string | undefined> {
    const engine: PhasedCommandEngine = await parseAsync(engineArgv, configuration);
    return engine.getEngineSharingBlocker(await parseAsync(requestArgv, configuration), rushSession);
  }

  beforeAll(() => {
    folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-engine-sharing-')));
    write('rush.json', {
      rushVersion: Rush.version,
      npmVersion: '10.0.0',
      projectFolderMinDepth: 1,
      projects: [
        { packageName: 'a', projectFolder: 'a' },
        { packageName: 'b', projectFolder: 'b' }
      ]
    });
    for (const name of ['a', 'b']) {
      write(`${name}/package.json`, {
        name,
        version: '1.0.0',
        dependencies: name === 'b' ? { a: '1.0.0' } : {},
        scripts: { '_phase:compile': 'node -v', '_phase:test': 'node -v', '_phase:lint': 'node -v' }
      });
    }
    write('common/config/rush/command-line.json', {
      phases: [
        { name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } },
        { name: '_phase:test', dependencies: { self: ['_phase:compile'] } },
        // Like a lint phase that reads the declarations of its dependencies.
        { name: '_phase:lint', dependencies: { upstream: ['_phase:compile'] } }
      ],
      commands: [
        { name: 'build', phases: ['_phase:compile'], incremental: true },
        { name: 'test', phases: ['_phase:compile', '_phase:test'], incremental: true },
        { name: 'retest', phases: ['_phase:compile', '_phase:test'], incremental: false },
        { name: 'lint', phases: ['_phase:lint'], incremental: true },
        // Lists the test phase without the compile phase that it depends on in the same project.
        { name: 'unit', phases: ['_phase:test'], incremental: true },
        // Like build, with the settings of command-line.json that are not the defaults.
        {
          name: 'quickbuild',
          phases: ['_phase:compile'],
          incremental: true,
          disableBuildCache: true,
          allowOversubscription: false
        }
      ].map((command) => ({
        ...command,
        commandKind: 'phased',
        summary: `The ${command.name} command`,
        enableParallelism: true
      })),
      parameters: [
        {
          parameterKind: 'flag',
          longName: '--production',
          description: 'Changes the commands of the compile phase',
          associatedCommands: ['build', 'test', 'retest', 'lint', 'quickbuild'],
          associatedPhases: ['_phase:compile']
        },
        {
          parameterKind: 'string',
          longName: '--target',
          argumentName: 'TARGET',
          description: 'Changes the commands of the compile phase',
          associatedCommands: ['build', 'test', 'retest', 'lint', 'quickbuild'],
          associatedPhases: ['_phase:compile']
        },
        {
          parameterKind: 'flag',
          longName: '--coverage',
          description: 'Changes the commands of the test phase',
          associatedCommands: ['test', 'retest'],
          associatedPhases: ['_phase:test']
        },
        {
          parameterKind: 'string',
          longName: '--report',
          argumentName: 'FILE',
          description: 'Read only by plugins',
          associatedCommands: ['test']
        }
      ]
    });
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(path.join(folder, 'rush.json'));
  });

  afterAll(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('serves other commands on the engine of an incremental command whose graph has their phases', async () => {
    expect(await getBlockerAsync(['build'], ['rebuild', '--only', 'a'])).toBeUndefined();
    expect(
      await getBlockerAsync(['build', '--to', 'a'], ['build', '--ignore-hooks', '--verbose'])
    ).toBeUndefined();
    for (const request of [
      ['build'],
      ['rebuild'],
      ['retest', '--only', 'b'],
      ['test', '--include-phase-deps']
    ]) {
      expect(await getBlockerAsync(['test'], request)).toBeUndefined();
    }
    expect(await getBlockerAsync(['lint'], ['build'])).toBeUndefined();
    expect(await getBlockerAsync(['lint'], ['lint', '--only', 'b', '--include-phase-deps'])).toBeUndefined();

    expect(await getBlockerAsync(['build'], ['test'])).toBe(
      'the graph of "build" does not have every operation of the "_phase:test" phase'
    );
    // With --include-phase-deps, the graph has compile operations only for the projects that others depend on.
    expect(await getBlockerAsync(['lint', '--include-phase-deps'], ['build'])).toBe(
      'the graph of "lint" does not have every operation of the "_phase:compile" phase'
    );
    // Each test operation needs the compile operation of its own project, so that graph has all of them.
    expect(await getBlockerAsync(['unit', '--include-phase-deps'], ['build'])).toBeUndefined();
  });

  it('serves only its own command on the engine of a command that is not incremental', async () => {
    expect(await getBlockerAsync(['rebuild'], ['rebuild', '--only', 'a', '-p', '2'])).toBeUndefined();
    expect(await getBlockerAsync(['retest', '--to', 'b'], ['retest', '--only', 'a'])).toBeUndefined();
    expect(await getBlockerAsync(['rebuild'], ['build'])).toBe('"rebuild" is not incremental');
    expect(await getBlockerAsync(['retest'], ['test'])).toBe('"retest" is not incremental');
  });

  it('serves no command that is not incremental on an engine that runs persistent IPC runners', async () => {
    const rushJsonPath: string = path.join(folder, 'rush.json');
    const rushJson: Record<string, unknown> = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
    write('rush.json', { ...rushJson, daemon: { usePersistentIpcRunners: true } });
    try {
      const withIpc: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      const getIpcBlockerAsync = (engineArgv: string[], requestArgv: string[]): Promise<string | undefined> =>
        getBlockerAsync(engineArgv, requestArgv, createRushSession(), withIpc);
      expect(await getIpcBlockerAsync(['build'], ['rebuild', '--only', 'a'])).toBe(
        '"rebuild" is not incremental, and "build" runs persistent IPC runners'
      );
      expect(await getIpcBlockerAsync(['test'], ['retest'])).toBe(
        '"retest" is not incremental, and "test" runs persistent IPC runners'
      );
      // Incremental commands still share the engine, and a command that is not incremental keeps its own.
      expect(await getIpcBlockerAsync(['test'], ['build'])).toBeUndefined();
      expect(await getIpcBlockerAsync(['build'], ['build', '--to', 'b'])).toBeUndefined();
      expect(await getIpcBlockerAsync(['rebuild'], ['rebuild', '--only', 'a'])).toBeUndefined();
      expect(await getIpcBlockerAsync(['rebuild'], ['build'])).toBe('"rebuild" is not incremental');
      const build: PhasedCommandEngine = await parseAsync(['build'], withIpc);
      expect(
        build.getEngineSharingBlocker(await parseAsync(['rebuild'], withIpc), createRushSession(), {
          engine: 'the engine',
          request: 'the request'
        })
      ).toBe('the request is not incremental, and the engine runs persistent IPC runners');
    } finally {
      write('rush.json', rushJson);
    }
  });

  it('compares the arguments of the phases that the request can run', async () => {
    const differ: string = 'the parameters of their phases differ';
    const production: string = '--production for "_phase:compile"';
    expect(await getBlockerAsync(['test'], ['build', '--production'])).toBe(
      `${differ} (only "build" sets ${production})`
    );
    expect(await getBlockerAsync(['build', '--production'], ['rebuild'])).toBe(
      `${differ} (only "build" sets ${production})`
    );
    expect(await getBlockerAsync(['build', '--production'], ['rebuild', '--production'])).toBeUndefined();
    // --coverage changes only the test phase, which build cannot run.
    expect(await getBlockerAsync(['test', '--coverage'], ['build'])).toBeUndefined();
    expect(await getBlockerAsync(['test', '--coverage'], ['retest'])).toBe(
      `${differ} (only "test" sets --coverage for "_phase:test")`
    );
    expect(await getBlockerAsync(['test', '--coverage'], ['test', '--production'])).toBe(
      `${differ} (only the engine's "test" sets --coverage for "_phase:test"; ` +
        `only the requested "test" sets ${production})`
    );
    // --changed-projects-only changes how the graph enables operations.
    expect(await getBlockerAsync(['build', '--changed-projects-only'], ['rebuild'])).toBe(
      `${differ} (only "build" sets --changed-projects-only)`
    );
    expect(await getBlockerAsync(['build'], ['build', '--changed-projects-only'])).toBe(
      `${differ} (only the requested "build" sets --changed-projects-only)`
    );
  });

  it('names the command that sets each parameter that differs, or that both set it', async () => {
    const differ: string = 'the parameters of their phases differ';
    expect(await getBlockerAsync(['build', '--target', 'es5'], ['build', '--target', 'es2020'])).toBe(
      `${differ} (both set --target for "_phase:compile", to different values)`
    );
    // An unset flag of the parser (--quiet) is false, and command-line.json sets its settings only if they are not
    // the defaults. Two commands that can serve each other get the same text in both directions.
    const expected: string =
      `${differ} (only "build" sets --quiet; only "quickbuild" sets --production for "_phase:compile", ` +
      'allowOversubscription to false in command-line.json and disableBuildCache to true in command-line.json)';
    expect(await getBlockerAsync(['--quiet', 'build'], ['quickbuild', '--production'])).toBe(expected);
    expect(await getBlockerAsync(['quickbuild', '--production'], ['--quiet', 'build'])).toBe(expected);
  });

  it('names the commands with the labels that the host passes', async () => {
    const rushSession: RushSession = createRushSession();
    const first: PhasedCommandEngine = await parseAsync(['test', '--coverage', '--target', 'es5']);
    const second: PhasedCommandEngine = await parseAsync(['test', '--production', '--target', 'es2020']);
    const firstLabel: string = 'the first "test"';
    const secondLabel: string = 'the second "test"';
    // The groups are in the order of the labels, whichever command created the engine.
    const expected: string =
      `the parameters of their phases differ (only ${firstLabel} sets --coverage for "_phase:test"; ` +
      `only ${secondLabel} sets --production for "_phase:compile"; ` +
      'both set --target for "_phase:compile", to different values)';
    expect(
      first.getEngineSharingBlocker(second, rushSession, { engine: firstLabel, request: secondLabel })
    ).toBe(expected);
    expect(
      second.getEngineSharingBlocker(first, rushSession, { engine: secondLabel, request: firstLabel })
    ).toBe(expected);
    const labels: IPhasedCommandEngineSharingLabels = { engine: 'the engine', request: 'the request' };
    const build: PhasedCommandEngine = await parseAsync(['build']);
    const rebuild: PhasedCommandEngine = await parseAsync(['rebuild']);
    expect(rebuild.getEngineSharingBlocker(build, rushSession, labels)).toBe('the engine is not incremental');
    expect(build.getEngineSharingBlocker(await parseAsync(['test']), rushSession, labels)).toBe(
      'the graph of the engine does not have every operation of the "_phase:test" phase'
    );
  });

  it('serves the same command only with the same values of the parameters that no phase has', async () => {
    expect(await getBlockerAsync(['test', '--report', 'x.json'], ['test'])).toBe(
      `their parameters differ (only the engine's "test" sets --report)`
    );
    expect(await getBlockerAsync(['test'], ['test', '--report', 'x.json'])).toBe(
      `their parameters differ (only the requested "test" sets --report)`
    );
    expect(await getBlockerAsync(['test', '--report', 'x.json'], ['test', '--report', 'y.json'])).toBe(
      'their parameters differ (both set --report, to different values)'
    );
    expect(
      await getBlockerAsync(['test', '--report', 'x.json'], ['test', '--only', 'a', '--report', 'x.json'])
    ).toBeUndefined();
    // Only plugins that are associated with test could read it, and build shares the engine only if there are none.
    expect(await getBlockerAsync(['test', '--report', 'x.json'], ['build'])).toBeUndefined();
  });

  it('serves no other command while a plugin taps the hooks that Rush calls with the command', async () => {
    const anyCommand: RushSession = createRushSession();
    anyCommand.hooks.runAnyPhasedCommand.tap('test', () => {});
    // Only a plugin's apply() can add a tap that a command-agnostic declaration covers.
    expect(await getBlockerAsync(['build'], ['rebuild'], anyCommand)).toBe(
      'a plugin taps the runAnyPhasedCommand hook outside its apply() (the tap "test")'
    );
    const intercepted: RushSession = createRushSession();
    intercepted.hooks.runAnyPhasedCommand.intercept({ call: () => {} });
    expect(await getBlockerAsync(['build'], ['rebuild'], intercepted)).toBe(
      'a plugin intercepts the runAnyPhasedCommand hook'
    );
    expect(await getBlockerAsync(['build'], ['build', '--to', 'b'], anyCommand)).toBeUndefined();

    const testCommand: RushSession = createRushSession();
    testCommand.hooks.runPhasedCommand.for('test').tap('test', () => {});
    expect(await getBlockerAsync(['test'], ['build'], testCommand)).toBe(
      'a plugin taps the runPhasedCommand hook of "test"'
    );
    expect(await getBlockerAsync(['build'], ['rebuild'], testCommand)).toBeUndefined();
    // A hook that no plugin taps does not block.
    const untapped: RushSession = createRushSession();
    untapped.hooks.runPhasedCommand.for('build');
    expect(await getBlockerAsync(['build'], ['rebuild'], untapped)).toBeUndefined();
  });
});
