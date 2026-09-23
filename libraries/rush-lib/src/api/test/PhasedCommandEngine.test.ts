// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NoOpTerminalProvider } from '@rushstack/terminal';

import { PhasedCommandEngine } from '../PhasedCommandEngine';
import { RushConfiguration } from '../RushConfiguration';

const PACKAGE_NAME: string = '@example/rush-example-plugin';
const PLUGIN_NAME: string = 'rush-example-plugin';
const PLUGIN_COMMAND: string = 'record-example';

interface IPluginFixture {
  readonly associatedCommands?: string[];
  readonly commandLineJson?: object;
  readonly writeManifest?: boolean;
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

function createRepo(plugin: IPluginFixture): string {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-engine-plugins-'));
  const write = (relativePath: string, json: object): void => {
    const filename: string = path.join(folder, relativePath);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(json));
  };
  write('rush.json', { rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [] });
  write('common/config/rush/command-line.json', REPO_COMMAND_LINE_JSON);
  write('common/config/rush/rush-plugins.json', {
    plugins: [{ packageName: PACKAGE_NAME, pluginName: PLUGIN_NAME, autoinstallerName: 'plugins' }]
  });
  write('common/autoinstallers/plugins/package.json', {
    name: 'plugins',
    version: '1.0.0',
    private: true,
    dependencies: { [PACKAGE_NAME]: '1.0.0' }
  });
  const storeFolder: string = `common/autoinstallers/plugins/rush-plugins/${PACKAGE_NAME}`;
  if (plugin.writeManifest !== false) {
    write(`${storeFolder}/rush-plugin-manifest.json`, {
      plugins: [
        {
          pluginName: PLUGIN_NAME,
          description: 'An example plugin.',
          entryPoint: './lib/index.js',
          associatedCommands: plugin.associatedCommands,
          commandLineJsonFilePath: './command-line.json'
        }
      ]
    });
  }
  if (plugin.commandLineJson) {
    write(`${storeFolder}/${PLUGIN_NAME}/command-line.json`, plugin.commandLineJson);
  }
  return folder;
}

async function parseBuildAsync(folder: string, argv: string[] = ['build']): Promise<PhasedCommandEngine> {
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    path.join(folder, 'rush.json')
  );
  return await PhasedCommandEngine.parseAsync({
    argv,
    cwd: folder,
    rushConfiguration,
    terminalProvider: new NoOpTerminalProvider()
  });
}

describe(PhasedCommandEngine.name, () => {
  const folders: string[] = [];
  function createTestRepo(plugin: IPluginFixture): string {
    const folder: string = createRepo(plugin);
    folders.push(folder);
    return folder;
  }

  afterEach(() => {
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

  it('rejects an unassociated plugin, which Rush initializes for every command', async () => {
    const folder: string = createTestRepo({ commandLineJson: COMMAND_SCOPED_COMMAND_LINE_JSON });
    await expect(parseBuildAsync(folder)).rejects.toThrow(
      `Daemon engine execution does not yet support Rush plugins that participate in "build": ` +
        `"${PLUGIN_NAME}" (${PACKAGE_NAME}) is initialized for every command. Use --no-daemon.`
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
      commandLineJson: {
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
      }
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
});
