// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { NoOpTerminalProvider, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { PhasedCommandEngine } from '../PhasedCommandEngine';
import { PhasedCommandEngineUsageError } from '../PhasedCommandEngineUsageError';
import { RushConfiguration } from '../RushConfiguration';
import { RushGlobalFolder } from '../RushGlobalFolder';
import { EnvironmentConfiguration } from '../EnvironmentConfiguration';
import { RushCommandLineParser } from '../../cli/RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';
import type { IBuiltInPluginConfiguration } from '../../pluginFramework/PluginLoader/BuiltInPluginLoader';
import { PluginManager } from '../../pluginFramework/PluginManager';
import { RushSession } from '../../pluginFramework/RushSession';
import { JsonFileLoadCache } from '../../utilities/JsonFileLoadCache';

const PACKAGE_NAME: string = '@example/rush-example-plugin';
const PLUGIN_NAME: string = 'rush-example-plugin';
const PLUGIN_COMMAND: string = 'record-example';
const OTHER_PLUGIN_NAME: string = 'rush-other-plugin';
const COMPATIBLE_PLUGINS_VARIABLE: string = 'RUSH_DAEMON_COMPATIBLE_PLUGINS';
const COMMAND_AGNOSTIC_PLUGINS_VARIABLE: string = 'RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS';

interface IPluginFixture {
  /** Defaults to PLUGIN_NAME. The plugin's package is `@example/<pluginName>`. */
  readonly pluginName?: string;
  readonly associatedCommands?: string[];
  readonly commandLineJson?: object;
  readonly writeManifest?: boolean;
  readonly daemonCompatible?: boolean;
  readonly daemonCommandAgnostic?: boolean;
  /** If set, the plugin package has an entry point whose apply() taps these session hooks. */
  readonly taps?: {
    readonly runAnyPhasedCommand?: boolean;
    /** The commands whose runPhasedCommand hook it taps. */
    readonly runPhasedCommand?: string[];
  };
}

interface IRepoFixture {
  readonly plugins: ReadonlyArray<IPluginFixture>;
  /** The rush.json `daemon.compatiblePlugins` setting. */
  readonly compatiblePlugins?: string[];
  /** The rush.json `daemon.commandAgnosticPlugins` setting. */
  readonly commandAgnosticPlugins?: string[];
  readonly commandLineJson?: object;
}

// Mirrors the command-scoped plugin that rushstack configures in common/config/rush/rush-plugins.json.
const COMMAND_SCOPED_COMMAND_LINE_JSON: object = {
  commands: [{ commandKind: 'globalPlugin', name: PLUGIN_COMMAND, summary: 'Records an example.' }],
  parameters: [
    {
      parameterKind: 'string',
      longName: '--output-path',
      argumentName: 'FILE_PATH',
      description: 'The output path.',
      associatedCommands: [PLUGIN_COMMAND]
    }
  ]
};

// A plugin that shapes the build phase, like odsp-web's fstrace plugin.
const PHASE_SHAPING_COMMAND_LINE_JSON: object = {
  ...COMMAND_SCOPED_COMMAND_LINE_JSON,
  phases: [{ name: '_phase:build' }],
  parameters: [
    {
      parameterKind: 'flag',
      longName: '--example-flag',
      description: 'An example flag.',
      associatedCommands: [PLUGIN_COMMAND],
      associatedPhases: ['_phase:build']
    }
  ]
};

const REPO_COMMAND_LINE_JSON: object = {
  commands: [
    {
      commandKind: 'phased',
      name: 'build',
      summary: 'Build',
      phases: ['_phase:build'],
      enableParallelism: true,
      incremental: true
    }
  ],
  phases: [{ name: '_phase:build', dependencies: { upstream: ['_phase:build'] } }]
};

function getPackageName(plugin: IPluginFixture): string {
  return `@example/${plugin.pluginName ?? PLUGIN_NAME}`;
}

function getPluginManifest(plugin: IPluginFixture): object {
  return {
    plugins: [
      {
        pluginName: plugin.pluginName ?? PLUGIN_NAME,
        description: 'An example plugin.',
        entryPoint: './lib/index.js',
        associatedCommands: plugin.associatedCommands,
        commandLineJsonFilePath: './command-line.json',
        daemonCompatible: plugin.daemonCompatible,
        daemonCommandAgnostic: plugin.daemonCommandAgnostic
      }
    ]
  };
}

/** Writes the package of `plugin`, with an entry point whose apply() taps the hooks of `plugin.taps`. */
function writePluginPackage(packageFolder: string, plugin: IPluginFixture): void {
  const pluginName: string = plugin.pluginName ?? PLUGIN_NAME;
  const { runAnyPhasedCommand, runPhasedCommand = [] } = plugin.taps ?? {};
  const statements: string[] = [
    ...(runAnyPhasedCommand ? ['hooks.runAnyPhasedCommand.tapPromise(name, async () => {});'] : []),
    ...runPhasedCommand.map(
      (commandName) => `hooks.runPhasedCommand.for(${JSON.stringify(commandName)}).tap(name, () => {});`
    )
  ];
  fs.mkdirSync(path.join(packageFolder, 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(packageFolder, 'package.json'),
    JSON.stringify({ name: getPackageName(plugin), version: '1.0.0' })
  );
  fs.writeFileSync(
    path.join(packageFolder, 'lib/index.js'),
    [
      'module.exports = class {',
      '  apply({ hooks }) {',
      `    const name = ${JSON.stringify(pluginName)};`,
      ...statements.map((statement) => `    ${statement}`),
      '  }',
      '};'
    ].join('\n')
  );
}

/** Writes `plugin` as a plugin that Rush provides itself, like its build cache plugins, in `pluginPackageFolder`. */
function writeBuiltInPlugin(
  pluginPackageFolder: string,
  plugin: IPluginFixture
): IBuiltInPluginConfiguration {
  writePluginPackage(pluginPackageFolder, plugin);
  fs.writeFileSync(
    path.join(pluginPackageFolder, 'rush-plugin-manifest.json'),
    JSON.stringify(getPluginManifest(plugin))
  );
  return {
    packageName: getPackageName(plugin),
    pluginName: plugin.pluginName ?? PLUGIN_NAME,
    pluginPackageFolder
  };
}

function createRepo(repo: IRepoFixture): string {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-engine-plugins-'));
  const write = (relativePath: string, json: object): void => {
    const filename: string = path.join(folder, relativePath);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(json));
  };
  const { compatiblePlugins, commandAgnosticPlugins } = repo;
  write('rush.json', {
    rushVersion: '5.179.0',
    pnpmVersion: '10.27.0',
    projects: [],
    ...(compatiblePlugins || commandAgnosticPlugins
      ? { daemon: { compatiblePlugins, commandAgnosticPlugins } }
      : {})
  });
  write('common/config/rush/command-line.json', repo.commandLineJson ?? REPO_COMMAND_LINE_JSON);
  write('common/config/rush/rush-plugins.json', {
    plugins: repo.plugins.map((plugin) => ({
      packageName: getPackageName(plugin),
      pluginName: plugin.pluginName ?? PLUGIN_NAME,
      autoinstallerName: 'plugins'
    }))
  });
  write('common/autoinstallers/plugins/package.json', {
    name: 'plugins',
    version: '1.0.0',
    private: true,
    dependencies: Object.fromEntries(repo.plugins.map((plugin) => [getPackageName(plugin), '1.0.0']))
  });
  for (const plugin of repo.plugins) {
    const pluginName: string = plugin.pluginName ?? PLUGIN_NAME;
    const storeFolder: string = `common/autoinstallers/plugins/rush-plugins/${getPackageName(plugin)}`;
    if (plugin.writeManifest !== false) {
      write(`${storeFolder}/rush-plugin-manifest.json`, getPluginManifest(plugin));
    }
    if (plugin.commandLineJson) {
      write(`${storeFolder}/${pluginName}/command-line.json`, plugin.commandLineJson);
    }
    if (plugin.taps) {
      writePluginPackage(
        path.join(folder, `common/autoinstallers/plugins/node_modules/${getPackageName(plugin)}`),
        plugin
      );
    }
  }
  return folder;
}

/** Applies the plugins that Rush initializes for `commandName` to a new session, as an engine does. */
async function applyPluginsAsync(
  folder: string,
  commandName: string,
  builtInPluginConfigurations: IBuiltInPluginConfiguration[] = []
): Promise<RushSession> {
  const terminalProvider: NoOpTerminalProvider = new NoOpTerminalProvider();
  const rushSession: RushSession = new RushSession({ terminalProvider, getIsDebugMode: () => false });
  const pluginManager: PluginManager = new PluginManager({
    terminal: new Terminal(terminalProvider),
    rushConfiguration: RushConfiguration.loadFromConfigurationFile(path.join(folder, 'rush.json')),
    rushSession,
    builtInPluginConfigurations: [...builtInPluginConfigurations],
    restrictConsoleOutput: true,
    rushGlobalFolder: new RushGlobalFolder()
  });
  await pluginManager.tryInitializeUnassociatedPluginsAsync();
  await pluginManager.tryInitializeAssociatedCommandPluginsAsync(commandName);
  expect(pluginManager.error).toBeUndefined();
  return rushSession;
}

async function parseBuildAsync(
  folder: string,
  argv: string[] = ['build'],
  terminalProvider: NoOpTerminalProvider | StringBufferTerminalProvider = new NoOpTerminalProvider()
): Promise<PhasedCommandEngine> {
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    path.join(folder, 'rush.json')
  );
  return await PhasedCommandEngine.parseAsync({
    argv,
    cwd: folder,
    rushConfiguration,
    terminalProvider
  });
}

describe(PhasedCommandEngine.name, () => {
  const folders: string[] = [];
  function createTestRepo(plugin: IPluginFixture, repo?: Omit<IRepoFixture, 'plugins'>): string {
    return createMultiPluginTestRepo({ ...repo, plugins: [plugin] });
  }
  function createMultiPluginTestRepo(repo: IRepoFixture): string {
    const folder: string = createRepo(repo);
    folders.push(folder);
    return folder;
  }

  const originalEnvironment: ReadonlyMap<string, string | undefined> = new Map(
    [COMPATIBLE_PLUGINS_VARIABLE, COMMAND_AGNOSTIC_PLUGINS_VARIABLE].map((name) => [name, process.env[name]])
  );
  afterEach(() => {
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    for (const folder of folders.splice(0)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('accepts a plugin that is associated with, and only shapes, a different command', async () => {
    const folder: string = createTestRepo({
      associatedCommands: [PLUGIN_COMMAND],
      commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON
    });
    for (const commandName of ['build', 'rebuild']) {
      const command: PhasedCommandEngine = await parseBuildAsync(folder, [commandName]);
      expect(command.commandName).toBe(commandName);
    }
  });

  it('accepts a plugin associated with no commands and without a command-line.json', async () => {
    const folder: string = createTestRepo({ associatedCommands: [] });
    const command: PhasedCommandEngine = await parseBuildAsync(folder);
    expect(command.commandName).toBe('build');
  });

  it('parses the phased commands of command-line.json and rejects a global command', async () => {
    const phase: string = '_phase:build';
    const folder: string = createMultiPluginTestRepo({
      plugins: [],
      commandLineJson: {
        commands: [
          {
            commandKind: 'phased',
            name: 'build',
            summary: 'Build',
            phases: [phase],
            enableParallelism: true,
            incremental: true
          },
          {
            commandKind: 'phased',
            name: 'retest',
            summary: 'Retest',
            phases: [phase],
            enableParallelism: true
          },
          { commandKind: 'global', name: 'hello', summary: 'Hello', shellCommand: 'echo hello' }
        ],
        phases: [{ name: phase, dependencies: { upstream: [phase] } }]
      }
    });
    const build: PhasedCommandEngine = await parseBuildAsync(folder);
    const retest: PhasedCommandEngine = await parseBuildAsync(folder, ['retest']);
    expect([build.commandName, build.isIncremental]).toEqual(['build', true]);
    expect([retest.commandName, retest.isIncremental]).toEqual(['retest', false]);
    expect(retest.parameterIdentity).not.toBe(build.parameterIdentity);
    await expect(parseBuildAsync(folder, ['hello'])).rejects.toThrow(
      'The daemon engine runs phased commands only; "hello" is not a phased command.'
    );
    // Only a phased command's command line is a usage error. In-process Rush reports any other invalid one.
    const stderrWrite: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      for (const argv of [
        ['retest', '--nope'],
        ['--debug', 'retest', '--nope']
      ]) {
        await expect(parseBuildAsync(folder, argv)).rejects.toMatchObject({
          name: PhasedCommandEngineUsageError.name,
          message: 'rush retest: error: Unrecognized arguments: --nope.',
          exitCode: 2
        });
      }
      for (const argv of [['hello', '--nope'], ['nope']]) {
        const error: unknown = await parseBuildAsync(folder, argv).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(PhasedCommandEngineUsageError);
      }
    } finally {
      stderrWrite.mockRestore();
    }
  });

  it('reports an invalid command line as a usage error with the exit code of native Rush', async () => {
    const folder: string = createTestRepo({ associatedCommands: [] });
    // The parser also prints the usage, as native Rush does.
    const stderrWrite: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      for (const [argv, message] of [
        [['build', '--nope'], 'rush build: error: Unrecognized arguments: --nope.'],
        [['rebuild', '--to'], 'rush rebuild: error: argument "-t/--to": Expected one argument. null']
      ] as const) {
        const error: unknown = await parseBuildAsync(folder, [...argv]).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PhasedCommandEngineUsageError);
        const { message: actualMessage, exitCode } = error as PhasedCommandEngineUsageError;
        expect({ message: actualMessage, exitCode }).toEqual({ message, exitCode: 2 });
      }
    } finally {
      stderrWrite.mockRestore();
    }
  });

  it('rejects an unassociated plugin, which Rush initializes for every command', async () => {
    const folder: string = createTestRepo({ commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON });
    await expect(parseBuildAsync(folder)).rejects.toThrow(
      `Daemon engine execution does not support Rush plugins that participate in "build" unless they are ` +
        `declared daemon-compatible: "${PLUGIN_NAME}" (${PACKAGE_NAME}) is initialized for every command. ` +
        `A plugin declares this with "daemonCompatible" in its rush-plugin-manifest.json; a repository can ` +
        `list plugins it has verified in the rush.json "daemon.compatiblePlugins" setting or ` +
        `RUSH_DAEMON_COMPATIBLE_PLUGINS. Use --no-daemon.`
    );
  });

  it('rejects a plugin associated with the requested command', async () => {
    const folder: string = createTestRepo({
      associatedCommands: [PLUGIN_COMMAND, 'build'],
      commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON
    });
    await expect(parseBuildAsync(folder)).rejects.toThrow(
      `"${PLUGIN_NAME}" (${PACKAGE_NAME}) is associated with "build"`
    );
    // The association is specific to the requested command.
    await expect(parseBuildAsync(folder, ['rebuild'])).resolves.toBeInstanceOf(PhasedCommandEngine);
  });

  it('rejects a plugin parameter associated with the requested command', async () => {
    const folder: string = createTestRepo({
      associatedCommands: [PLUGIN_COMMAND],
      commandLineJson: {
        commands: [
          { commandKind: 'globalPlugin', name: PLUGIN_COMMAND, summary: 'Records an example.' },
          { commandKind: 'bulk', name: 'build', summary: 'Build', enableParallelism: true }
        ],
        parameters: [
          {
            parameterKind: 'flag',
            longName: '--example-flag',
            description: 'An example flag.',
            associatedCommands: [PLUGIN_COMMAND, 'build']
          }
        ]
      }
    });
    // A plugin-defined build replaces the repository build, so the repository must not also define it.
    fs.rmSync(path.join(folder, 'common/config/rush/command-line.json'));
    await expect(parseBuildAsync(folder)).rejects.toThrow(
      `"${PLUGIN_NAME}" (${PACKAGE_NAME}) associates "--example-flag" with "build"`
    );
  });

  it('rejects a plugin parameter associated with a phase of the requested command', async () => {
    const folder: string = createTestRepo({
      associatedCommands: [PLUGIN_COMMAND],
      commandLineJson: PHASE_SHAPING_COMMAND_LINE_JSON
    });
    await expect(parseBuildAsync(folder)).rejects.toThrow(
      `"${PLUGIN_NAME}" (${PACKAGE_NAME}) associates "--example-flag" with the "_phase:build" phase`
    );
  });

  it('fails closed when a configured plugin manifest cannot be read', async () => {
    const folder: string = createTestRepo({ writeManifest: false });
    await expect(parseBuildAsync(folder)).rejects.toThrow(
      `"${PLUGIN_NAME}" (${PACKAGE_NAME}): its manifest could not be read`
    );
  });

  describe('daemon-compatible declarations', () => {
    // Associated with build and rebuild, and shapes a build phase and parameter, like odsp-web's fstrace plugin.
    const BUILD_PLUGIN: IPluginFixture = {
      associatedCommands: [PLUGIN_COMMAND, 'build', 'rebuild'],
      commandLineJson: PHASE_SHAPING_COMMAND_LINE_JSON
    };

    async function expectAcceptedAsync(folder: string): Promise<void> {
      for (const commandName of ['build', 'rebuild']) {
        const command: PhasedCommandEngine = await parseBuildAsync(folder, [commandName]);
        expect(command.commandName).toBe(commandName);
        expect(command.unmatchedCompatiblePluginNames).toEqual([]);
      }
    }

    it('reports every reason for an undeclared plugin', async () => {
      const folder: string = createTestRepo(BUILD_PLUGIN);
      const label: string = `"${PLUGIN_NAME}" (${PACKAGE_NAME})`;
      await expect(parseBuildAsync(folder)).rejects.toThrow(
        `${label} is associated with "build"; ${label} defines the "_phase:build" phase; ` +
          `${label} associates "--example-flag" with the "_phase:build" phase. A plugin declares this`
      );
    });

    it('accepts a plugin whose manifest declares it daemon-compatible', async () => {
      await expectAcceptedAsync(createTestRepo({ ...BUILD_PLUGIN, daemonCompatible: true }));
    });

    it('accepts a plugin that rush.json declares daemon-compatible', async () => {
      await expectAcceptedAsync(createTestRepo(BUILD_PLUGIN, { compatiblePlugins: [PLUGIN_NAME] }));
    });

    it('accepts a plugin that RUSH_DAEMON_COMPATIBLE_PLUGINS declares, overriding rush.json', async () => {
      const folder: string = createTestRepo(BUILD_PLUGIN, { compatiblePlugins: [] });
      process.env[COMPATIBLE_PLUGINS_VARIABLE] = ` ${PLUGIN_NAME} `;
      await expectAcceptedAsync(folder);
    });

    it('lets an empty RUSH_DAEMON_COMPATIBLE_PLUGINS withdraw the rush.json declarations', async () => {
      const folder: string = createTestRepo(BUILD_PLUGIN, { compatiblePlugins: [PLUGIN_NAME] });
      process.env[COMPATIBLE_PLUGINS_VARIABLE] = '';
      await expect(parseBuildAsync(folder)).rejects.toThrow(
        `"${PLUGIN_NAME}" (${PACKAGE_NAME}) is associated with "build"`
      );
    });

    it('accepts a declared plugin that Rush initializes for every command', async () => {
      await expectAcceptedAsync(
        createTestRepo({ commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON, daemonCompatible: true })
      );
      await expectAcceptedAsync(
        createTestRepo(
          { commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON },
          { compatiblePlugins: [PLUGIN_NAME] }
        )
      );
    });

    it('still rejects an undeclared plugin next to a declared one, and reports only the undeclared one', async () => {
      const folder: string = createMultiPluginTestRepo({
        plugins: [BUILD_PLUGIN, { pluginName: OTHER_PLUGIN_NAME, associatedCommands: ['build'] }],
        compatiblePlugins: [PLUGIN_NAME]
      });
      const error: Error | undefined = await parseBuildAsync(folder).then(
        () => undefined,
        (reason: Error) => reason
      );
      expect(error?.message).toContain(
        `unless they are declared daemon-compatible: "${OTHER_PLUGIN_NAME}" (@example/${OTHER_PLUGIN_NAME}) ` +
          `is associated with "build". A plugin declares this`
      );
      expect(error?.message).not.toContain(PLUGIN_NAME);
    });

    it('fails closed for a declared plugin whose manifest or command-line.json cannot be read', async () => {
      await expect(
        parseBuildAsync(createTestRepo({ writeManifest: false }, { compatiblePlugins: [PLUGIN_NAME] }))
      ).rejects.toThrow(`"${PLUGIN_NAME}" (${PACKAGE_NAME}): its manifest could not be read`);
      // The native parser also reads the file, and may fail first; either way, parsing fails.
      await expect(
        parseBuildAsync(
          createTestRepo({
            ...BUILD_PLUGIN,
            daemonCompatible: true,
            commandLineJson: { commands: 'invalid' }
          })
        )
      ).rejects.toThrow(/command-line\.json/);
    });

    it('keeps the parameters that a declared plugin reads in the engine parameter identity', async () => {
      // odsp-web's fstrace plugin reads --fstrace-mode, which the repository's command-line.json defines.
      const folder: string = createTestRepo(
        { ...BUILD_PLUGIN, daemonCompatible: true },
        {
          commandLineJson: {
            ...REPO_COMMAND_LINE_JSON,
            parameters: [
              {
                parameterKind: 'choice',
                longName: '--example-mode',
                description: 'An example mode.',
                associatedCommands: ['build'],
                alternatives: [
                  { name: 'on', description: 'On.' },
                  { name: 'off', description: 'Off.' }
                ],
                defaultValue: 'on'
              }
            ]
          }
        }
      );
      const defaultIdentity: string = (await parseBuildAsync(folder)).parameterIdentity;
      expect((await parseBuildAsync(folder)).parameterIdentity).toBe(defaultIdentity);
      expect((await parseBuildAsync(folder, ['build', '--example-mode', 'off'])).parameterIdentity).not.toBe(
        defaultIdentity
      );
    });

    it('shares an engine between commands only if the same plugins are associated with both', async () => {
      const rushSession: RushSession = new RushSession({
        terminalProvider: new NoOpTerminalProvider(),
        getIsDebugMode: () => false
      });
      const getRebuildBlockerAsync = async (plugin: IPluginFixture): Promise<string | undefined> => {
        const folder: string = createTestRepo({ ...plugin, daemonCompatible: true });
        const build: PhasedCommandEngine = await parseBuildAsync(folder, ['build']);
        return build.getEngineSharingBlocker(await parseBuildAsync(folder, ['rebuild']), rushSession);
      };
      expect(await getRebuildBlockerAsync(BUILD_PLUGIN)).toBeUndefined();
      // Rush initializes a plugin that is associated with no command for every command.
      expect(
        await getRebuildBlockerAsync({ commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON })
      ).toBeUndefined();
      expect(await getRebuildBlockerAsync({ ...BUILD_PLUGIN, associatedCommands: ['build'] })).toBe(
        'different plugins are associated with "rebuild" and "build"'
      );
    });

    it('warns about declared names that match no configured plugin', async () => {
      const folder: string = createTestRepo(
        { ...BUILD_PLUGIN, daemonCompatible: true },
        { compatiblePlugins: ['rush-exmaple-plugin', PLUGIN_NAME] }
      );
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
      const command: PhasedCommandEngine = await parseBuildAsync(folder, ['build'], terminalProvider);
      expect(command.unmatchedCompatiblePluginNames).toEqual(['rush-exmaple-plugin']);
      expect(terminalProvider.getWarningOutput()).toContain(
        'names plugins that are not configured in rush-plugins.json: "rush-exmaple-plugin".'
      );
      // A misspelled name does not declare the plugin that it was meant to name.
      process.env[COMPATIBLE_PLUGINS_VARIABLE] = 'rush-exmaple-plugin';
      await expect(parseBuildAsync(createTestRepo(BUILD_PLUGIN))).rejects.toThrow(
        `"${PLUGIN_NAME}" (${PACKAGE_NAME}) is associated with "build"`
      );
    });
  });

  describe('command-agnostic declarations', () => {
    // Initialized for every command, like swarm-dogfood's watch-skip plugin, which taps runAnyPhasedCommand.
    const ANY_COMMAND_PLUGIN: IPluginFixture = {
      daemonCompatible: true,
      taps: { runAnyPhasedCommand: true }
    };
    const UNDECLARED: string =
      `the plugin "${PLUGIN_NAME}" (${PACKAGE_NAME}) taps the runAnyPhasedCommand hook and is not ` +
      'declared command-agnostic';

    beforeEach(() => {
      jest.spyOn(Autoinstaller.prototype, 'prepareAsync').mockImplementation(async () => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    /** Whether an engine that `build` created, with the plugins applied, can serve `rebuild`. */
    async function getRebuildBlockerAsync(
      folder: string,
      builtInPluginConfigurations?: IBuiltInPluginConfiguration[]
    ): Promise<string | undefined> {
      const build: PhasedCommandEngine = await parseBuildAsync(folder, ['build']);
      const rushSession: RushSession = await applyPluginsAsync(folder, 'build', builtInPluginConfigurations);
      // The plugins never prevent the engine from serving its own command.
      expect(
        build.getEngineSharingBlocker(await parseBuildAsync(folder, ['build']), rushSession)
      ).toBeUndefined();
      return build.getEngineSharingBlocker(await parseBuildAsync(folder, ['rebuild']), rushSession);
    }

    it('shares no engine between commands while an undeclared plugin taps runAnyPhasedCommand', async () => {
      expect(await getRebuildBlockerAsync(createTestRepo(ANY_COMMAND_PLUGIN))).toBe(UNDECLARED);
    });

    it('shares an engine between commands if the manifest declares the plugin command-agnostic', async () => {
      expect(
        await getRebuildBlockerAsync(createTestRepo({ ...ANY_COMMAND_PLUGIN, daemonCommandAgnostic: true }))
      ).toBeUndefined();
      // The declaration also covers a plugin that is associated with both commands.
      expect(
        await getRebuildBlockerAsync(
          createTestRepo({
            ...ANY_COMMAND_PLUGIN,
            associatedCommands: ['build', 'rebuild'],
            daemonCommandAgnostic: true
          })
        )
      ).toBeUndefined();
    });

    it('shares an engine between commands if rush.json declares the plugin command-agnostic', async () => {
      expect(
        await getRebuildBlockerAsync(
          createTestRepo(ANY_COMMAND_PLUGIN, { commandAgnosticPlugins: [PLUGIN_NAME] })
        )
      ).toBeUndefined();
    });

    it('lets only its manifest declare a built-in plugin command-agnostic', async () => {
      // Like daemon.compatiblePlugins, rush.json's list names the plugins that rush-plugins.json configures.
      const folder: string = createMultiPluginTestRepo({
        plugins: [],
        commandAgnosticPlugins: [PLUGIN_NAME]
      });
      const listed: IBuiltInPluginConfiguration = writeBuiltInPlugin(
        path.join(folder, 'listed'),
        ANY_COMMAND_PLUGIN
      );
      expect(await getRebuildBlockerAsync(folder, [listed])).toBe(UNDECLARED);
      const declared: IBuiltInPluginConfiguration = writeBuiltInPlugin(path.join(folder, 'declared'), {
        ...ANY_COMMAND_PLUGIN,
        daemonCommandAgnostic: true
      });
      expect(await getRebuildBlockerAsync(folder, [declared])).toBeUndefined();
    });

    it('lets RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS override rush.json', async () => {
      process.env[COMMAND_AGNOSTIC_PLUGINS_VARIABLE] = ` ${PLUGIN_NAME} `;
      expect(
        await getRebuildBlockerAsync(createTestRepo(ANY_COMMAND_PLUGIN, { commandAgnosticPlugins: [] }))
      ).toBeUndefined();
      // An empty value withdraws the rush.json declarations.
      process.env[COMMAND_AGNOSTIC_PLUGINS_VARIABLE] = '';
      expect(
        await getRebuildBlockerAsync(
          createTestRepo(ANY_COMMAND_PLUGIN, { commandAgnosticPlugins: [PLUGIN_NAME] })
        )
      ).toBe(UNDECLARED);
    });

    it('names an undeclared plugin that taps runAnyPhasedCommand next to a declared one', async () => {
      const folder: string = createMultiPluginTestRepo({
        plugins: [ANY_COMMAND_PLUGIN, { ...ANY_COMMAND_PLUGIN, pluginName: OTHER_PLUGIN_NAME }],
        commandAgnosticPlugins: [PLUGIN_NAME]
      });
      expect(await getRebuildBlockerAsync(folder)).toBe(
        `the plugin "${OTHER_PLUGIN_NAME}" (@example/${OTHER_PLUGIN_NAME}) taps the runAnyPhasedCommand hook ` +
          'and is not declared command-agnostic'
      );
    });

    it('shares no engine while a declared plugin taps the runPhasedCommand hook of either command', async () => {
      for (const commandName of ['build', 'rebuild']) {
        const folder: string = createTestRepo({
          ...ANY_COMMAND_PLUGIN,
          daemonCommandAgnostic: true,
          taps: { runAnyPhasedCommand: true, runPhasedCommand: [commandName] }
        });
        expect(await getRebuildBlockerAsync(folder)).toBe(
          `a plugin taps the runPhasedCommand hook of "${commandName}"`
        );
      }
    });

    it('shares no engine while a tap that no plugin applied is on runAnyPhasedCommand', async () => {
      const folder: string = createTestRepo({ ...ANY_COMMAND_PLUGIN, daemonCommandAgnostic: true });
      const build: PhasedCommandEngine = await parseBuildAsync(folder, ['build']);
      const rushSession: RushSession = await applyPluginsAsync(folder, 'build');
      const rebuild: PhasedCommandEngine = await parseBuildAsync(folder, ['rebuild']);
      expect(build.getEngineSharingBlocker(rebuild, rushSession)).toBeUndefined();
      rushSession.hooks.runAnyPhasedCommand.tap('late', () => {});
      expect(build.getEngineSharingBlocker(rebuild, rushSession)).toBe(
        'a plugin taps the runAnyPhasedCommand hook outside its apply() (the tap "late")'
      );
    });

    it('warns about command-agnostic names that match no configured plugin', async () => {
      const folder: string = createTestRepo(ANY_COMMAND_PLUGIN, {
        commandAgnosticPlugins: ['rush-exmaple-plugin']
      });
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
      const command: PhasedCommandEngine = await parseBuildAsync(folder, ['build'], terminalProvider);
      expect(command.unmatchedCompatiblePluginNames).toEqual([]);
      expect(terminalProvider.getWarningOutput()).toContain(
        `The daemon's command-agnostic plugin list (rush.json "daemon.commandAgnosticPlugins" or ` +
          `RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS) names plugins that are not configured in rush-plugins.json: ` +
          `"rush-exmaple-plugin".`
      );
      // A misspelled name does not declare the plugin that it was meant to name.
      expect(await getRebuildBlockerAsync(folder)).toBe(UNDECLARED);
    });
  });

  describe('JSON configuration files of parses that share a workspace configuration', () => {
    const REPO_COMMAND_LINE_PATH: string = 'common/config/rush/command-line.json';
    const AUTOINSTALLER_PACKAGE_JSON_PATH: string = 'common/autoinstallers/plugins/package.json';
    const PLUGIN_STORE_FOLDER: string = `common/autoinstallers/plugins/rush-plugins/${PACKAGE_NAME}`;
    const MANIFEST_PATH: string = `${PLUGIN_STORE_FOLDER}/rush-plugin-manifest.json`;
    const PLUGIN_COMMAND_LINE_PATH: string = `${PLUGIN_STORE_FOLDER}/${PLUGIN_NAME}/command-line.json`;
    const EXAMPLE_MODE_PARAMETER: object = {
      parameterKind: 'choice',
      longName: '--example-mode',
      description: 'An example mode.',
      associatedCommands: ['build'],
      alternatives: [
        { name: 'on', description: 'On.' },
        { name: 'off', description: 'Off.' }
      ],
      defaultValue: 'on'
    };
    // A global command whose autoinstaller's package.json Rush reads while it parses any command line.
    const GLOBAL_COMMAND_LINE_JSON: object = {
      ...REPO_COMMAND_LINE_JSON,
      commands: [
        ...(REPO_COMMAND_LINE_JSON as { commands: object[] }).commands,
        {
          commandKind: 'global',
          name: 'example-global',
          summary: 'An example.',
          shellCommand: 'node example.js',
          autoinstallerName: 'plugins'
        }
      ]
    };

    interface IManifestJson {
      plugins: { associatedCommands: string[] }[];
    }

    function createSharedConfigurationRepo(): RushConfiguration {
      const folder: string = createTestRepo(
        { associatedCommands: [PLUGIN_COMMAND], commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON },
        { commandLineJson: GLOBAL_COMMAND_LINE_JSON }
      );
      return RushConfiguration.loadFromConfigurationFile(path.join(folder, 'rush.json'));
    }

    function editJson<T>(
      rushConfiguration: RushConfiguration,
      relativePath: string,
      edit: (json: T) => void
    ): void {
      const filePath: string = path.join(rushConfiguration.rushJsonFolder, relativePath);
      const json: T = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      edit(json);
      fs.writeFileSync(filePath, JSON.stringify(json));
    }

    async function parseAsync(
      rushConfiguration: RushConfiguration,
      argv: string[] = ['build']
    ): Promise<PhasedCommandEngine> {
      return await PhasedCommandEngine.parseAsync({
        argv,
        cwd: rushConfiguration.rushJsonFolder,
        rushConfiguration,
        terminalProvider: new NoOpTerminalProvider()
      });
    }

    async function getParseErrorAsync(rushConfiguration: RushConfiguration): Promise<Error | undefined> {
      return await parseAsync(rushConfiguration).then(
        () => undefined,
        (error: Error) => error
      );
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('sees each change to the repository command-line.json', async () => {
      const rushConfiguration: RushConfiguration = createSharedConfigurationRepo();
      await expect(parseAsync(rushConfiguration, ['build', '--example-mode', 'off'])).rejects.toThrow(
        '--example-mode'
      );

      editJson<{ parameters?: object[] }>(rushConfiguration, REPO_COMMAND_LINE_PATH, (json) => {
        json.parameters = [EXAMPLE_MODE_PARAMETER];
      });
      const offIdentity: string = (await parseAsync(rushConfiguration, ['build', '--example-mode', 'off']))
        .parameterIdentity;
      expect((await parseAsync(rushConfiguration)).parameterIdentity).not.toBe(offIdentity);
    });

    it('reports an invalid repository command-line.json for every parse, as a parse without the cache does', async () => {
      const rushConfiguration: RushConfiguration = createSharedConfigurationRepo();
      await parseAsync(rushConfiguration);

      editJson<{ unknownSetting?: boolean }>(rushConfiguration, REPO_COMMAND_LINE_PATH, (json) => {
        json.unknownSetting = true;
      });
      const error: Error | undefined = await getParseErrorAsync(rushConfiguration);
      expect(error?.message).toMatch(/command-line\.json/);
      expect((await getParseErrorAsync(rushConfiguration))?.message).toBe(error?.message);
      await expect(parseBuildAsync(rushConfiguration.rushJsonFolder)).rejects.toThrow(error?.message);

      editJson<{ unknownSetting?: boolean }>(rushConfiguration, REPO_COMMAND_LINE_PATH, (json) => {
        delete json.unknownSetting;
      });
      await expect(parseAsync(rushConfiguration)).resolves.toBeInstanceOf(PhasedCommandEngine);
    });

    it("sees each change to a plugin's manifest and command-line.json", async () => {
      const rushConfiguration: RushConfiguration = createSharedConfigurationRepo();
      await expect(parseAsync(rushConfiguration)).resolves.toBeInstanceOf(PhasedCommandEngine);

      editJson<IManifestJson>(rushConfiguration, MANIFEST_PATH, (manifest) => {
        manifest.plugins[0].associatedCommands.push('build');
      });
      await expect(parseAsync(rushConfiguration)).rejects.toThrow(
        `"${PLUGIN_NAME}" (${PACKAGE_NAME}) is associated with "build"`
      );

      editJson<IManifestJson>(rushConfiguration, MANIFEST_PATH, (manifest) => {
        manifest.plugins[0].associatedCommands.pop();
      });
      fs.writeFileSync(
        path.join(rushConfiguration.rushJsonFolder, PLUGIN_COMMAND_LINE_PATH),
        JSON.stringify(PHASE_SHAPING_COMMAND_LINE_JSON)
      );
      await expect(parseAsync(rushConfiguration)).rejects.toThrow(
        `"${PLUGIN_NAME}" (${PACKAGE_NAME}) associates "--example-flag" with the "_phase:build" phase`
      );
    });

    it("sees each change to the package.json of a global command's autoinstaller", async () => {
      const rushConfiguration: RushConfiguration = createSharedConfigurationRepo();
      await expect(parseAsync(rushConfiguration)).resolves.toBeInstanceOf(PhasedCommandEngine);

      editJson<{ name: string }>(rushConfiguration, AUTOINSTALLER_PACKAGE_JSON_PATH, (packageJson) => {
        packageJson.name = 'other';
      });
      await expect(parseAsync(rushConfiguration)).rejects.toThrow(
        `specifies an "autoinstallerName" setting, but the package.json file's "name" field is not "plugins"`
      );
    });

    it('reads each file for every parse, but parses it only if it changed', async () => {
      const rushConfiguration: RushConfiguration = createSharedConfigurationRepo();
      const filePaths: string[] = [
        REPO_COMMAND_LINE_PATH,
        AUTOINSTALLER_PACKAGE_JSON_PATH,
        MANIFEST_PATH,
        PLUGIN_COMMAND_LINE_PATH
      ].map((relativePath) => path.join(rushConfiguration.rushJsonFolder, relativePath));
      const texts: string[] = filePaths.map((filePath) => fs.readFileSync(filePath, 'utf8'));
      await parseAsync(rushConfiguration);

      const readFileSpy: jest.SpyInstance = jest.spyOn(FileSystem, 'readFile');
      const loadSpy: jest.SpyInstance = jest.spyOn(JsonFile, 'load');
      const parseStringSpy: jest.SpyInstance = jest.spyOn(JsonFile, 'parseString');
      await parseAsync(rushConfiguration);

      const readFilePaths: Set<string> = new Set(readFileSpy.mock.calls.map(([filePath]) => filePath));
      expect(filePaths.filter((filePath) => !readFilePaths.has(filePath))).toEqual([]);
      expect(loadSpy.mock.calls.filter(([filePath]) => filePaths.includes(filePath))).toEqual([]);
      expect(parseStringSpy.mock.calls.filter(([text]) => texts.includes(text))).toEqual([]);
    });

    it('does not cache the files for a native command line', async () => {
      const rushConfiguration: RushConfiguration = createSharedConfigurationRepo();
      const cacheLoadSpy: jest.SpyInstance = jest.spyOn(JsonFileLoadCache.prototype, 'load');
      const loadSpy: jest.SpyInstance = jest.spyOn(JsonFile, 'load');
      // Engine parses in this process validated the environment, and a native parser must load .env files first.
      EnvironmentConfiguration.reset();

      const parser: RushCommandLineParser = new RushCommandLineParser({
        cwd: rushConfiguration.rushJsonFolder
      });
      expect(parser.getAction('example-global')).toBeDefined();
      expect(cacheLoadSpy).not.toHaveBeenCalled();
      const loadedFilePaths: Set<string> = new Set(loadSpy.mock.calls.map(([filePath]) => filePath));
      expect(loadedFilePaths).toContain(path.join(rushConfiguration.rushJsonFolder, REPO_COMMAND_LINE_PATH));
      expect(loadedFilePaths).toContain(
        path.join(rushConfiguration.rushJsonFolder, AUTOINSTALLER_PACKAGE_JSON_PATH)
      );
    });
  });
});
