// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { NoOpTerminalProvider, StringBufferTerminalProvider } from '@rushstack/terminal';

import { PhasedCommandEngine } from '../PhasedCommandEngine';
import { PhasedCommandEngineUsageError } from '../PhasedCommandEngineUsageError';
import { RushConfiguration } from '../RushConfiguration';
import { EnvironmentConfiguration } from '../EnvironmentConfiguration';
import { RushCommandLineParser } from '../../cli/RushCommandLineParser';
import { JsonFileLoadCache } from '../../utilities/JsonFileLoadCache';

const PACKAGE_NAME: string = '@example/rush-example-plugin';
const PLUGIN_NAME: string = 'rush-example-plugin';
const PLUGIN_COMMAND: string = 'record-example';
const OTHER_PLUGIN_NAME: string = 'rush-other-plugin';
const COMPATIBLE_PLUGINS_VARIABLE: string = 'RUSH_DAEMON_COMPATIBLE_PLUGINS';

interface IPluginFixture {
  /** Defaults to PLUGIN_NAME. The plugin's package is `@example/<pluginName>`. */
  readonly pluginName?: string;
  readonly associatedCommands?: string[];
  readonly commandLineJson?: object;
  readonly writeManifest?: boolean;
  readonly daemonCompatible?: boolean;
}

interface IRepoFixture {
  readonly plugins: ReadonlyArray<IPluginFixture>;
  /** The rush.json `daemon.compatiblePlugins` setting. */
  readonly compatiblePlugins?: string[];
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

function createRepo(repo: IRepoFixture): string {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-engine-plugins-'));
  const write = (relativePath: string, json: object): void => {
    const filename: string = path.join(folder, relativePath);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(json));
  };
  write('rush.json', {
    rushVersion: '5.179.0',
    pnpmVersion: '10.27.0',
    projects: [],
    ...(repo.compatiblePlugins ? { daemon: { compatiblePlugins: repo.compatiblePlugins } } : {})
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
      write(`${storeFolder}/rush-plugin-manifest.json`, {
        plugins: [
          {
            pluginName,
            description: 'An example plugin.',
            entryPoint: './lib/index.js',
            associatedCommands: plugin.associatedCommands,
            commandLineJsonFilePath: './command-line.json',
            daemonCompatible: plugin.daemonCompatible
          }
        ]
      });
    }
    if (plugin.commandLineJson) {
      write(`${storeFolder}/${pluginName}/command-line.json`, plugin.commandLineJson);
    }
  }
  return folder;
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

  const originalCompatiblePlugins: string | undefined = process.env[COMPATIBLE_PLUGINS_VARIABLE];
  afterEach(() => {
    if (originalCompatiblePlugins === undefined) {
      delete process.env[COMPATIBLE_PLUGINS_VARIABLE];
    } else {
      process.env[COMPATIBLE_PLUGINS_VARIABLE] = originalCompatiblePlugins;
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
        createTestRepo({ commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON }, { compatiblePlugins: [PLUGIN_NAME] })
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
          createTestRepo({ ...BUILD_PLUGIN, daemonCompatible: true, commandLineJson: { commands: 'invalid' } })
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

    function editJson<T>(rushConfiguration: RushConfiguration, relativePath: string, edit: (json: T) => void): void {
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

      const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: rushConfiguration.rushJsonFolder });
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
